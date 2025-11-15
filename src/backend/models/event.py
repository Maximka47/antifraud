from pydantic import BaseModel
from typing import Optional, Dict, Any


class EventIn(BaseModel):
    user_agent: Optional[str] = None
    timezone: Optional[str] = None
    language: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
