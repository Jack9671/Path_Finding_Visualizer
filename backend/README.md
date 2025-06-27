# Backend (FastAPI)

## Setup

### On Windows (Command Prompt)
```bat
cd backend
setup.bat
call .venv\Scripts\activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- The API runs at http://localhost:8000  
- CORS is enabled for http://localhost:3000