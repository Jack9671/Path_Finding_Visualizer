@echo off
python -m venv .venv
call .venv\Scripts\activate
pip install -r requirements.txt
echo Backend setup complete. To run the server, use:
echo   call .venv\Scripts\activate
echo   uvicorn main:app --reload --host 0.0.0.0 --port 8000
pause