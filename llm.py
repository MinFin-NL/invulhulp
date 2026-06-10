"""
LLM backend abstraction: chat, streaming chat and embeddings.

Exactly one backend is active per process, chosen by `create_backend()`:
Azure OpenAI when AZURE_OPENAI_ENDPOINT is set, Ollama otherwise.

Environment variables:
    # Azure OpenAI — used when AZURE_OPENAI_ENDPOINT is set
    AZURE_OPENAI_ENDPOINT        — e.g. https://oai-foundation-inno-d.openai.azure.com/
    AZURE_OPENAI_API_KEY         — API key
    AZURE_OPENAI_DEPLOYMENT      — deployment name (default: gpt-5.3-chat)
    AZURE_OPENAI_API_VERSION     — API version (default: 2025-04-01-preview)
    AZURE_OPENAI_REASONING_MODEL — "true"/"false": deployment is a reasoning model
                                   (developer role, no temperature, no streaming).
                                   Default: inferred from an o1/o3/o4 name prefix.

    # Azure OpenAI embeddings — optional separate resource for embeddings.
    # If AZURE_OPENAI_EMBEDDING_ENDPOINT is unset, the chat endpoint/key/version are reused.
    AZURE_OPENAI_EMBEDDING_ENDPOINT      — embedding resource endpoint
    AZURE_OPENAI_EMBEDDING_API_KEY       — API key for the embedding resource
    AZURE_OPENAI_EMBEDDING_API_VERSION   — API version (falls back to AZURE_OPENAI_API_VERSION)
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT    — embedding deployment name (e.g. text-embedding-3-small)

    # Ollama — used when AZURE_OPENAI_ENDPOINT is not set
    OLLAMA_MODEL            — model name (default: mistral)
    OLLAMA_BASE_URL         — Ollama server URL (default: http://localhost:11434)
    OLLAMA_EMBEDDING_MODEL  — embedding model (default: nomic-embed-text)
"""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator
from typing import Protocol

import ollama
import openai
from dotenv import load_dotenv
from openai import AsyncAzureOpenAI

load_dotenv()


class LLMBackend(Protocol):
    """Minimal surface the rest of the app programs against."""

    async def chat(self, system: str, user: str) -> str:
        """Send a chat message and return the full response content."""
        ...

    def stream(self, system: str, user: str) -> AsyncGenerator[str, None]:
        """Yield raw text chunks from the LLM as they arrive."""
        ...

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of texts in one batched call."""
        ...


class AzureBackend:
    def __init__(
        self,
        *,
        endpoint: str,
        api_key: str,
        api_version: str,
        deployment: str,
        is_reasoning: bool,
        embedding_endpoint: str = "",
        embedding_api_key: str = "",
        embedding_api_version: str = "",
        embedding_deployment: str = "",
    ) -> None:
        self._client = AsyncAzureOpenAI(
            azure_endpoint=endpoint, api_key=api_key, api_version=api_version
        )
        self._deployment = deployment
        self._is_reasoning = is_reasoning
        # Optimistically send temperature=0; flips to False the first time the
        # deployment rejects the parameter so later calls skip the failed attempt.
        self._supports_temperature = not is_reasoning
        self._embedding_deployment = embedding_deployment
        # Embeddings may live on a different Azure OpenAI resource.
        if embedding_endpoint:
            self._embedding_client = AsyncAzureOpenAI(
                azure_endpoint=embedding_endpoint,
                api_key=embedding_api_key,
                api_version=embedding_api_version or api_version,
            )
        else:
            self._embedding_client = self._client

    def _messages(self, system: str, user: str) -> list[dict]:
        system_role = "developer" if self._is_reasoning else "system"
        return [
            {"role": system_role, "content": system},
            {"role": "user", "content": user},
        ]

    async def _create(self, messages: list[dict], **kwargs):
        return await self._client.chat.completions.create(
            model=self._deployment, messages=messages, **kwargs
        )

    @staticmethod
    def _rejects_temperature(e: openai.BadRequestError) -> bool:
        return getattr(e, "param", None) == "temperature"

    async def chat(self, system: str, user: str) -> str:
        messages = self._messages(system, user)
        if self._supports_temperature:
            try:
                response = await self._create(messages, temperature=0)
                return response.choices[0].message.content or ""
            except openai.BadRequestError as e:
                if not self._rejects_temperature(e):
                    raise
                self._supports_temperature = False
        response = await self._create(messages)
        return response.choices[0].message.content or ""

    async def stream(self, system: str, user: str) -> AsyncGenerator[str, None]:
        messages = self._messages(system, user)
        # o-series reasoning models do not support streaming
        if self._is_reasoning:
            response = await self._create(messages)
            yield response.choices[0].message.content or ""
            return
        if self._supports_temperature:
            try:
                stream = await self._create(messages, stream=True, temperature=0)
            except openai.BadRequestError as e:
                if not self._rejects_temperature(e):
                    raise
                self._supports_temperature = False
                stream = await self._create(messages, stream=True)
        else:
            stream = await self._create(messages, stream=True)
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        if not self._embedding_deployment:
            raise RuntimeError(
                "No embedding backend configured. Set AZURE_OPENAI_EMBEDDING_DEPLOYMENT."
            )
        response = await self._embedding_client.embeddings.create(
            model=self._embedding_deployment, input=texts
        )
        return [d.embedding for d in response.data]


class OllamaBackend:
    def __init__(self, *, host: str, model: str, embedding_model: str) -> None:
        self._client = ollama.AsyncClient(host=host)
        self._model = model
        self._embedding_model = embedding_model

    async def chat(self, system: str, user: str) -> str:
        response = await self._client.chat(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            keep_alive=-1,
            options={"temperature": 0.1},
        )
        return response.message.content or ""

    async def stream(self, system: str, user: str) -> AsyncGenerator[str, None]:
        stream = await self._client.chat(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            stream=True,
            keep_alive=-1,
            options={"temperature": 0.1},
        )
        async for chunk in stream:
            if chunk.message.content:
                yield chunk.message.content

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        response = await self._client.embed(model=self._embedding_model, input=texts)
        return [list(v) for v in response.embeddings]


def _env_flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


def create_backend() -> LLMBackend:
    azure_endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT", "")
    if azure_endpoint:
        deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-5.3-chat")
        api_version = os.environ.get("AZURE_OPENAI_API_VERSION", "2025-04-01-preview")
        return AzureBackend(
            endpoint=azure_endpoint,
            api_key=os.environ.get("AZURE_OPENAI_API_KEY", ""),
            api_version=api_version,
            deployment=deployment,
            is_reasoning=_env_flag(
                "AZURE_OPENAI_REASONING_MODEL",
                default=deployment.startswith(("o1", "o3", "o4")),
            ),
            embedding_endpoint=os.environ.get("AZURE_OPENAI_EMBEDDING_ENDPOINT", ""),
            embedding_api_key=os.environ.get("AZURE_OPENAI_EMBEDDING_API_KEY", ""),
            embedding_api_version=os.environ.get("AZURE_OPENAI_EMBEDDING_API_VERSION", ""),
            embedding_deployment=os.environ.get("AZURE_OPENAI_EMBEDDING_DEPLOYMENT", ""),
        )
    return OllamaBackend(
        host=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
        model=os.environ.get("OLLAMA_MODEL", "mistral"),
        embedding_model=os.environ.get("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text"),
    )
