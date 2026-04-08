import chainlit as cl
import httpx

BACKEND_URL = "http://localhost:3000"


@cl.on_chat_start
async def start():
    cl.user_session.set("session_id", None)
    await cl.Message(content="Welcome to Knowledge Bot! How can I help?").send()


@cl.on_message
async def main(message: cl.Message):
    session_id = cl.user_session.get("session_id")
    payload = {"message": message.content}
    if session_id:
        payload["sessionId"] = session_id

    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(f"{BACKEND_URL}/chat", json=payload)
        data = res.json()

    cl.user_session.set("session_id", data["sessionId"])
    await cl.Message(content=data["reply"]).send()
