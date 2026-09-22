#!/usr/bin/env python3
"""
Simple test script to check Grok API response structure.
"""

import httpx
from openai import OpenAI
from scripts.delitzsch.strongs.config import XAI_API_KEY, GROK_MODEL, GROK_BASE_URL
import json


def test_grok_api():
    """Test basic Grok API call."""
    print("Testing Grok API connection...")

    if not XAI_API_KEY:
        print("ERROR: XAI_API_KEY not found")
        return

    print(f"API Key length: {len(XAI_API_KEY)}")
    print(f"Model: {GROK_MODEL}")
    print(f"Base URL: {GROK_BASE_URL}")

    client = OpenAI(
        api_key=XAI_API_KEY,
        base_url=GROK_BASE_URL,
        timeout=httpx.Timeout(30),  # Shorter timeout for testing
    )

    # Simple test prompt
    test_words = [
        {"text": "יֵשׁוּעַ", "verse": "Test verse", "prefixes": []}
    ]

    system_prompt = "You are a Hebrew biblical lexicographer. Return only a JSON array with Strong's assignments."
    user_prompt = f'Assign Strong\'s number to: {test_words[0]["text"]}\nReturn format: ["H3050"]'

    print("Making API call...")

    try:
        # Try chat completions instead of responses
        response = client.chat.completions.create(
            model=GROK_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=100,
            temperature=0.1
        )

        print("API call successful!")
        print(f"Response type: {type(response)}")
        print(
            f"Response attributes: {[attr for attr in dir(response) if not attr.startswith('_')]}")

        if hasattr(response, 'choices') and response.choices:
            choice = response.choices[0]
            print(f"Choice type: {type(choice)}")
            if hasattr(choice, 'message'):
                message = choice.message
                print(f"Message type: {type(message)}")
                if hasattr(message, 'content'):
                    content = message.content
                    print(f"Content: {repr(content)}")
                    if content is not None:
                        try:
                            parsed = json.loads(content)
                            print(f"Successfully parsed JSON: {parsed}")
                        except json.JSONDecodeError as e:
                            print(f"Failed to parse JSON: {e}")
                    else:
                        print("No content returned; cannot parse JSON")
                else:
                    print("No content in message")
            else:
                print("No message in choice")
        else:
            print("No choices in response")

    except Exception as e:
        print(f"API call failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    test_grok_api()
