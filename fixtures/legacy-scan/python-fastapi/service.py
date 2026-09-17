from fastapi import FastAPI
from pydantic import BaseModel, field_validator
from celery import shared_task
import requests
from sqlalchemy.orm import Session

app = FastAPI()

class Order(BaseModel):
    id: str

    @field_validator("id")
    def validate_id(cls, value):
        return value

@app.post("/orders")
def create_order(order: Order, session: Session):
    session.execute("select 1")
    requests.get("https://inventory.example")
    return order

@shared_task
def publish_order():
    return True
