from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Envelope(BaseModel, Generic[T]):
    data: T
    meta: dict[str, Any] = {}


class ListMeta(BaseModel):
    total: int
    limit: int
    offset: int


class ListEnvelope(BaseModel, Generic[T]):
    data: list[T]
    meta: ListMeta
