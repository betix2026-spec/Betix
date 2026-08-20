import os
import logging
from typing import List, Dict, Any, Optional, Union
import google.generativeai as genai

# Placeholder imports with checks
try:
    from openai import AsyncOpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

try:
    from anthropic import AsyncAnthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

# Generic logger
logger = logging.getLogger("ai_engine")

class ChatModel:
    """
    A generic, reusable AI Chat Model wrapper supporting multiple providers.
    Designed to be project-agnostic.
    """

    def __init__(
        self, 
        provider: str = "gemini", 
        api_key: Optional[str] = None, 
        model_name: Optional[str] = None,
        **config
    ):
        """
        Initialize the ChatModel.
        
        Args:
            provider: 'gemini', 'gpt' (or 'openai'), 'claude' (or 'anthropic').
            api_key: API key for the provider. If None, tries to fetch from env vars.
            model_name: Specific model version (e.g., 'gpt-4', 'claude-3-opus'). 
                        If None, uses defaults.
            **config: Additional configuration (temperature, max_tokens, etc.).
        """
        self.provider = provider.lower()
        self.api_key = api_key
        self.model_name = model_name
        
        # Unified History: List of dicts {'role': 'user'|'model'|'system', 'content': str}
        self.history: List[Dict[str, str]] = []
        
        self.config = {
            "temperature": 0.7,
            "max_tokens": 1000,
            "top_p": 0.9,
            "top_k": 40,
            **config
        }
        
        self.client = None
        self._init_client()

    def _init_client(self):
        """Initializes the provider client/resources."""
        
        # --- GEMINI ---
        if self.provider == "gemini":
            key = self.api_key or os.getenv("GEMINI_API_KEY")
            if not key:
                logger.warning("No API key provided for Gemini.")
            else:
                genai.configure(api_key=key)
            
            # Set default model if not provided
            self.target_model_name = self.model_name or "gemini-flash-latest"

        # --- OPENAI ---
        elif self.provider in ["gpt", "openai"]:
            if not OPENAI_AVAILABLE:
                logger.error("openai library not installed.")
                return
                
            key = self.api_key or os.getenv("OPENAI_API_KEY")
            if not key:
                logger.warning("No API key provided for OpenAI.")
            
            self.client = AsyncOpenAI(api_key=key)
            self.target_model_name = self.model_name or "gpt-4-turbo"

        elif self.provider in ["claude", "anthropic"]:
            if not ANTHROPIC_AVAILABLE:
                logger.error("anthropic library not installed.")
                return

            key = self.api_key or os.getenv("ANTHROPIC_API_KEY")
            if not key:
                logger.warning("No API key provided for Anthropic.")
            
            self.client = AsyncAnthropic(api_key=key)
            self.target_model_name = self.model_name or "claude-3-haiku-20240307"

        else:
            raise ValueError(f"Unsupported provider: {self.provider}")

    # --- History Management ---

    def add_message(self, role: str, content: str):
        """
        Manually add a message to history.
        Role should be 'user', 'model' (or 'assistant'), or 'system'.
        """
        # Normalize roles for internal storage
        if role == "assistant": role = "model"
        self.history.append({"role": role, "content": content})

    def get_history(self) -> List[Dict[str, str]]:
        return self.history

    def clear_history(self):
        self.history = []

    # --- Generation ---

    async def generate_response(
        self, 
        message: str, 
        system_instruction: Optional[str] = None,
        **runtime_config
    ) -> str:
        """
        Generates a response for the given message, respecting history and optional system instruction.
        
        Args:
            message: The user input.
            system_instruction: Optional system prompt for this specific generation. 
                                (Note: For some providers, changing this frequently might not vary context perfectly if session is cached, 
                                but here we rebuild context per request for stateless correctness).
            **runtime_config: Override config parameters (temp, tokens) for this call.
        
        Returns:
            The AI response string.
        """
        
        # 1. Merge configs
        current_config = {**self.config, **runtime_config}
        
        # 2. Add User Message to History
        self.add_message("user", message)
        
        response_text = ""
        
        try:
            if self.provider == "gemini":
                response_text = await self._generate_gemini(system_instruction, current_config)
            elif self.provider in ["gpt", "openai"]:
                response_text = await self._generate_openai(system_instruction, current_config)
            elif self.provider in ["claude", "anthropic"]:
                response_text = await self._generate_claude(system_instruction, current_config)
            else:
                return f"Provider {self.provider} not initialized."
            
            # 3. Add Model Response to History
            self.add_message("model", response_text)
            return response_text

        except Exception as e:
            logger.error(f"Generation error ({self.provider}): {e}")
            return f"Error: {e}"

    # --- Internal Handlers ---

    async def _generate_gemini(self, system_instruction: str, config: Dict[str, Any]) -> str:
        # Create a fresh model instance to support dynamic system_instruction
        model = genai.GenerativeModel(
            model_name=self.target_model_name,
            system_instruction=system_instruction,
            generation_config={
                "temperature": config.get("temperature"),
                "max_output_tokens": config.get("max_tokens"),
                "top_p": config.get("top_p"),
                "top_k": config.get("top_k"),
            }
        )
        
        # Convert history format
        # Internal: [{'role': 'user'|'model', 'content': '...'}]
        # Gemini: [{'role': 'user'|'model', 'parts': ['...']}]
        gemini_history = []
        for msg in self.history[:-1]: # Exclude the last message which is the current one
            gemini_history.append({
                "role": "user" if msg["role"] == "user" else "model",
                "parts": [msg["content"]]
            })
            
        chat = model.start_chat(history=gemini_history)
        last_msg_content = self.history[-1]["content"]
        
        response = await chat.send_message_async(last_msg_content)
        return response.text

    async def _generate_openai(self, system_instruction: str, config: Dict[str, Any]) -> str:
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
            
        for msg in self.history:
            role = "assistant" if msg["role"] == "model" else "user"
            messages.append({"role": role, "content": msg["content"]})

        response = await self.client.chat.completions.create(
            model=self.target_model_name,
            messages=messages,
            temperature=config.get("temperature"),
            max_tokens=config.get("max_tokens")
        )
        return response.choices[0].message.content

    async def _generate_claude(self, system_instruction: str, config: Dict[str, Any]) -> str:
        messages = []
        for msg in self.history:
            role = "assistant" if msg["role"] == "model" else "user"
            messages.append({"role": role, "content": msg["content"]})

        kwargs = {
            "model": self.target_model_name,
            "messages": messages,
            "max_tokens": config.get("max_tokens"),
            "temperature": config.get("temperature"),
        }

        if system_instruction:
            # cache_control marks this block for prompt caching — a no-op
            # (silently uncached, no error) for any caller whose system
            # prompt is short or changes every call, but a real saving for
            # the sport-expert prompts in prompt_builder.py, which are
            # identical across every match and every call (initial, delta,
            # on-demand) for a given sport. ~0.1x input price on a cache
            # hit vs full price uncached.
            kwargs["system"] = [{
                "type": "text",
                "text": system_instruction,
                "cache_control": {"type": "ephemeral"},
            }]

        try:
            response = await self.client.messages.create(**kwargs)
        except Exception as e:
            # The newest Claude models (confirmed: Sonnet 5, Opus 5) reject
            # `temperature` outright ("deprecated for this model") — older
            # ones (Haiku 4.5, Sonnet 4.6) accept it fine, so this can't be a
            # fixed per-model param set without hardcoding a model-name check
            # that breaks the next time DEFAULT_MODEL changes. Retry once
            # without it instead.
            if "temperature" in str(e) and "deprecated" in str(e).lower():
                kwargs.pop("temperature", None)
                response = await self.client.messages.create(**kwargs)
            else:
                raise
        return response.content[0].text
