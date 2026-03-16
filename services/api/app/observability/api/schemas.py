from pydantic import BaseModel

# --- Daily Costs ---


class UsageByModel(BaseModel):
    model: str
    inputUsage: int
    outputUsage: int
    totalUsage: int
    totalCost: float
    countObservations: int


class DailyCostEntry(BaseModel):
    date: str
    totalCost: float
    countObservations: int
    usage: list[UsageByModel]


class CostsResponse(BaseModel):
    daily: list[DailyCostEntry]


# --- Requests ---


class RequestEntry(BaseModel):
    id: str
    name: str | None
    model: str | None
    startTime: str
    endTime: str | None
    completionStartTime: str | None = None
    inputTokens: int
    outputTokens: int
    totalTokens: int
    cost: float | None
    latencyMs: int | None
    metadata: str | None = None


class RequestsMeta(BaseModel):
    page: int
    limit: int
    totalItems: int
    totalPages: int


class RequestsResponse(BaseModel):
    data: list[RequestEntry]
    meta: RequestsMeta


class ModelsResponse(BaseModel):
    models: list[str]


# --- Import ---


class ImportRecordResponse(BaseModel):
    id: int
    started_at: str
    finished_at: str | None
    mode: str
    from_timestamp: str | None
    to_timestamp: str
    status: str
    error_message: str | None = None


class ImportStatusResponse(BaseModel):
    lastImport: ImportRecordResponse | None
    lastStatus: str | None
    counts: dict[str, int]
