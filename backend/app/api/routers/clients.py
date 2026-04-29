"""Router CRUD de clientes."""

import uuid
import math

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.models.client import Client
from app.schemas.client import ClientCreate, ClientResponse, ClientUpdate
from app.schemas.common import PaginatedResponse

router = APIRouter(prefix="/clients", tags=["clients"])

_can_ver = Depends(make_permission_checker("clientes", "ver"))
_can_crear = Depends(make_permission_checker("clientes", "crear"))
_can_editar = Depends(make_permission_checker("clientes", "editar"))


@router.get("", response_model=PaginatedResponse[ClientResponse], dependencies=[_can_ver])
async def list_clients(
    current_user: CurrentUser,
    db: DbSession,
    page: int = 1,
    size: int = 20,
) -> PaginatedResponse[ClientResponse]:
    total = (
        await db.execute(
            select(func.count()).select_from(Client).where(Client.tenant_id == current_user.tenant_id)
        )
    ).scalar_one()

    clients = (
        await db.execute(
            select(Client)
            .where(Client.tenant_id == current_user.tenant_id)
            .offset((page - 1) * size)
            .limit(size)
            .order_by(Client.name)
        )
    ).scalars().all()

    return PaginatedResponse(
        items=clients,
        total=total,
        page=page,
        size=size,
        pages=math.ceil(total / size) if total else 1,
    )


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED, dependencies=[_can_crear])
async def create_client(body: ClientCreate, current_user: CurrentUser, db: DbSession) -> Client:
    client = Client(tenant_id=current_user.tenant_id, **body.model_dump())
    db.add(client)
    await db.flush()
    await db.refresh(client)
    return client


@router.get("/{client_id}", response_model=ClientResponse, dependencies=[_can_ver])
async def get_client(client_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> Client:
    client = (await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")
    return client


@router.patch("/{client_id}", response_model=ClientResponse, dependencies=[_can_editar])
async def update_client(
    client_id: uuid.UUID, body: ClientUpdate, current_user: CurrentUser, db: DbSession
) -> Client:
    client = (await db.execute(
        select(Client).where(Client.id == client_id, Client.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente no encontrado")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(client, field, value)
    await db.flush()
    await db.refresh(client)
    return client
