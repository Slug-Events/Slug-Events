This is a [Flask](https://flask.palletsprojects.com/en/stable/) application.

## Getting Backend Started

First, create a virtual environment:
```bash
python -m venv .venv
```

Second, activate the virtual environment:
- On Windows:
  ```
  venv\Scripts\activate
  ```
- On macOS and Linux:
  ```
  source venv/bin/activate
  ```

Next, install the required packages:
```bash
pip install -r requirements.txt
```

Then, run the Flask application on port `8080`:
```bash
flask run -p 8080
```


While [http://localhost:8080](http://localhost:8080) cannot be directly accessed with your browser, it is used by the frontend for login and authorization, as well as communicating with the database, so it is crucial it is up and running when accessing the site.

You can start editing the backend by modifying `app.py`, `event.py`, and `helpers.py`. The server auto-updates as you edit the files.

## Learn More

To learn more about Flask, take a look at the following resources:

- [Flask Documentation](https://flask.palletsprojects.com/en/stable/) - learn about Flask features and API.

You can check out [the Flask GitHub repository](https://github.com/pallets/flask)