from pydantic import BaseSettings


class Settings(BaseSettings):
    MONGO_URL: str = "mongodb://localhost:27017"
    MONGO_DB: str = "antifraud"

    class Config:
        env_file = ".env"


settings = Settings()
