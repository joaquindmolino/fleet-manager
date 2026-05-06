"""Schemas de autenticación: login, tokens, registro."""

from pydantic import BaseModel


class TenantCheckResponse(BaseModel):
    name: str
    slug: str


class LoginRequest(BaseModel):
    tenant_slug: str
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str
