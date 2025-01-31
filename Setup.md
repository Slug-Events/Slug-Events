# Local setup

## Frontend setup

:warning: This is all in the context of the /frontend directory

### Env file for frontend

Make sure you have the correct ```.env.local``` file and its in /frontend. It should be in the discord.

### Installing nextjs dependencies

```npm install```
  
### Running nextjs server

```npm run dev```

## Backend setup

:warning: This is all in the context of the /backend directory

### Env file for backend

Make sure you have the correct ```.env``` file and its in ./backend. It should be in the discord.

### Installing python dependencies

```pip install -r requirements.txt```
  
### Running flask server

```flask run -p 8080```[^1]

[^1]: localhost:8080 is authorized on the google auth credentials already so best to stick with port 8080
