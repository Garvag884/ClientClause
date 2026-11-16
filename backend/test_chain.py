import llm

print("Order in use:", llm._priority_order())
print(llm.ask_llm("Say hello in 5 words"))
print("Answered by:", llm.last_provider)
print(llm.ask_json('Reply with JSON only: {"ok": true, "city": "Bengaluru"}'))
