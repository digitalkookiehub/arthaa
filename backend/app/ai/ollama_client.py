import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class OllamaClient:
    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL
        self.model = settings.OLLAMA_MODEL

    async def generate(self, prompt: str, system: str = "") -> str:
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "system": system,
                        "stream": False,
                    },
                )
                response.raise_for_status()
                return response.json().get("response", "")
        except Exception as e:
            logger.error("Ollama generate failed: %s", str(e))
            return "AI service temporarily unavailable. Please try again later."

    async def chat(self, messages: list[dict]) -> str:
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json={"model": self.model, "messages": messages, "stream": False},
                )
                response.raise_for_status()
                return response.json().get("message", {}).get("content", "")
        except Exception as e:
            logger.error("Ollama chat failed: %s", str(e))
            return "AI service temporarily unavailable. Please try again later."


ollama_client = OllamaClient()
