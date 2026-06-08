"""
Ajino v5 — LLM Client helper for research module.
Simple wrapper around LiteLLM HTTP API.
"""

import json

import httpx


async def litellm_call(
    model: str,
    prompt: str,
    max_tokens: int = 1000,
    temperature: float = 0.5,
    litellm_url: str = "http://litellm:4000",
    litellm_api_key: str = "",
) -> str:
    """Call LiteLLM with a single prompt. Returns text content."""
    headers = {"Content-Type": "application/json"}
    if litellm_api_key:
        headers["Authorization"] = f"Bearer {litellm_api_key}"

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(
                f"{litellm_url}/chat/completions",
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                },
                headers=headers,
            )

            if resp.status_code != 200:
                error_body = resp.text[:500]
                print(
                    f"[llm_client] HTTP {resp.status_code} from {litellm_url}: {error_body}"
                )
                return f"_Lỗi LLM HTTP {resp.status_code}_"

            data = resp.json()

            # Handle LiteLLM error response
            if "error" in data:
                print(f"[llm_client] LiteLLM error: {data['error']}")
                return f"_Lỗi LLM: {data['error'].get('message', str(data['error']))}_"

            # Normal response: choices[0].message.content
            if "choices" in data and len(data["choices"]) > 0:
                choice = data["choices"][0]
                # Handle both 'message' and 'text' formats
                if "message" in choice:
                    return choice["message"].get("content", "")
                elif "text" in choice:
                    return choice["text"]

            # Unexpected format — log and return raw
            print(f"[llm_client] unexpected response format: {json.dumps(data)[:500]}")
            return f"_Lỗi parse LLM response_"

    except httpx.TimeoutException:
        print(f"[llm_client] timeout calling {model}")
        return f"_Timeout gọi LLM {model}_"
    except Exception as e:
        print(f"[llm_client] error calling {model}: {e}")
        return f"_Lỗi gọi LLM: {str(e)}_"
