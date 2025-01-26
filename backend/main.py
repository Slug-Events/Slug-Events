"""Main file for Flask API"""

from flask import Flask

app = Flask(__name__)

@app.route("/")
def hello_world():
    """Simple Hello world

    Returns:
        String: "Hello World"
    """
    return "Hello World"


if __name__ == "__main__":
    app.run()
