import os
from motor.motor_asyncio import AsyncIOMotorClient
from core.config import settings

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(settings.MONGO_URL)
    return _client


def get_database():
    client = get_client()
    return client[settings.MONGO_DB]
