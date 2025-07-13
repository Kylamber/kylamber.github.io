---
date: '2025-07-12T18:43:30+07:00'
draft: false
title: 'Python Getting Started'
tags:
- 'programming'
- 'python'
---

Python is a programming language. But not all computers can read Python. You'd first need to download Python from https://www.python.org. For guides on how to install Python, I'll refer these videos for MacOS or Windows.

- [Amit Thinks - How to install Python 3.13.0 on Windows 11](https://www.youtube.com/watch?v=C3bOxcILGu4)
- [WittCode - How to Install Python on Mac](https://www.youtube.com/watch?v=utVZYVJSTZA)

What's important is that Python needs to be added to the PATH or Environment Variables. This enables you to access Python through Command Prompt/Terminal (I'll use the term terminal to reference these because it's shorter). 

After installation you should be able to run `python` or `python3` inside the terminal (pick whichever works)

```console
$ python3
Python 3.13.5 (main, Jun 21 2025, 15:00:31) [GCC 15.1.1 20250425] on linux
Type "help", "copyright", "credits" or "license" for more information.
>>> 1+1
2
>>> exit()
```

## Installing additional packages

Python, by default, doesn't come with the fancy _packages_. For example, if you want to work with Excel files in Python you'd need [Pandas](https://www.pandas.pydata.org). If you tried to run Pandas, you would get this error

```console
$ python3
Python 3.13.5 (main, Jun 21 2025, 15:00:31) [GCC 15.1.1 20250425] on linux
Type "help", "copyright", "credits" or "license" for more information.
>>> import pandas
Traceback (most recent call last):
  File "<python-input-0>", line 1, in <module>
    import pandas
ModuleNotFoundError: No module named 'pandas'
```

To get the ability to use these packages, you'd need to install them through [Pip](https://pip.pypa.io/en/stable/getting-started/). Pip is a package manager for Python, it downloads ands installs the packages you specify from [PyPi](https://pypi.org/) to your computer. For example, you should be able to run either 

- `python3 -m pip install pandas`, or
- `pip install pandas` for short,

in the terminal to install Pandas

```console
$ pip install pandas
Collecting pandas
  Downloading pandas-2.3.1-cp313-cp313-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (91 kB)
Collecting numpy>=1.26.0 (from pandas)
  Using cached numpy-2.3.1-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (62 kB)
Collecting python-dateutil>=2.8.2 (from pandas)
  Using cached python_dateutil-2.9.0.post0-py2.py3-none-any.whl.metadata (8.4 kB)
Collecting pytz>=2020.1 (from pandas)
  Using cached pytz-2025.2-py2.py3-none-any.whl.metadata (22 kB)
Collecting tzdata>=2022.7 (from pandas)
  Using cached tzdata-2025.2-py2.py3-none-any.whl.metadata (1.4 kB)
Collecting six>=1.5 (from python-dateutil>=2.8.2->pandas)
  Using cached six-1.17.0-py2.py3-none-any.whl.metadata (1.7 kB)
Downloading pandas-2.3.1-cp313-cp313-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (12.1 MB)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 12.1/12.1 MB 9.4 MB/s eta 0:00:00
Using cached numpy-2.3.1-cp313-cp313-manylinux_2_28_x86_64.whl (16.6 MB)
Using cached python_dateutil-2.9.0.post0-py2.py3-none-any.whl (229 kB)
Using cached pytz-2025.2-py2.py3-none-any.whl (509 kB)
Using cached six-1.17.0-py2.py3-none-any.whl (11 kB)
Using cached tzdata-2025.2-py2.py3-none-any.whl (347 kB)
Installing collected packages: pytz, tzdata, six, numpy, python-dateutil, pandas
Successfully installed numpy-2.3.1 pandas-2.3.1 python-dateutil-2.9.0.post0 pytz-2025.2 six-1.17.0 tzdata-2025.2
```

If pip does not exist for some reason, you can run 

```bash-session { lineNos= false }
$ python3 -m ensurepip
``` 

in the terminal to install it.

People may also have `requirements.txt` files that lists all required packages. Simply run 

```bash-session { lineNos=false }
$ pip install -r requirements.txt
``` 

and Pip will install the packages listed in requirements.txt 

## Virtual Environments

There comes a time where you need to install a different version of a package for compatibility. To not break other projects in your computer, [virtual environments](https://docs.python.org/3/library/venv.html) (venv) comes to the rescue by separating Python packages for each projects. To make one, simply run

```bash-session { lineNos=false }
$ python -m venv name_of_venv
```

to get into the venv, check one this table [here](https://docs.python.org/3/library/venv.html#how-venvs-work). I use this one since I'm on Linux

```bash-session { lineNos=false }
$ source name_of_venv/bin/activate
```

There should be an indicator if you are currently inside a venv. To confirm, you can run this script as stated in the "How venvs work" section,

```bash-session {hl_lines=["7-8"]}
$ python
Python 3.13.5 (main, Jun 21 2025, 15:00:31) [GCC 15.1.1 20250425] on linux
Type "help", "copyright", "credits" or "license" for more information.
>>> import sys
>>> sys.prefix
/path/to/your/venv/directory/python
>>> sys.prefix != sys.base_prefix
true
```

and it should also use the venv's Pip,

```bash-session
$ pip --version
/path/to/your/venv/directory/pip
```

## Writing Python code

There are two styles of writing Python code. One is writing to files ending in .py and the other is cells inside files ending in .ipynb. 

Starting with .py files, simply create one. For example create a file named 'hello_world.py' and using your preferred text editors such as Notepad, TextEditor, VSCode, etc, write this

```python { lineNos=false }
print("hello world")
```

To run the program, open the terminal in the directory containing the file by either navigating to it manually or right clicking inside an explorer/finder/files app and select "Open in terminal"

```bash-session
$ python hello_world.py
hello world
```

and there you have your first Python program!

Next up is the .ipynb files. You could try installing Jupyter Lab on your own, or you can go [here](https://jupyter.org/try) to try Jupyter Lab, or [Google Colab](https://colab.research.google.com).

![Jupyter Lab](/blog/python-getting-started/jupyterlab.png)

## Using Docker (advanced)

[Docker](https://www.docker.com/) is another application that can make "containers". While venv still uses your device's operating system, containers can virtualize an operating system. This means that the Python applications will work on all device running docker which is extremely convenient.

Simply select a version of Python from DockerHub and create a dockerfile.

```dockerfile
FROM python:3.13.2-slim-bookworm

WORKDIR /usr/src/app

RUN pip install --no-cache-dir jupyterlab

CMD [ "jupyter", "lab", "--port", "8889", "--ip", "0.0.0.0", "--no-browser", "--allow-root" ]
```

Then, simply build the image 

```bash-session {lineNos=false}
$ sudo docker build . -t name/app:latest
```

run the image

```bash-session {lineNos=false}
$ sudo docker run --rm -p "8889:8889" name/app:latest
```

and you got yourself a jupyter lab running in Debian Linux!

## What's Next?

Now is just a matter on what to do. 

Are you new to programming and would like to know what you can do in Python? Check out [this](https://www.w3schools.com/python/python_getstarted.asp) guide by W3schools.

If you'd like to indulge in some data science, you got the aformentioned Pandas for processing excel-like stuffs, [NumPy](https://numpy.org/) to perform fast math operations, [SciPy](https://scipy.org/) for scientific computing, or plotting datas with [Plotly](https://plotly.com/python/), and many more to discover!

Perhaps web development? [Django](https://www.djangoproject.com/) is nice because it has batteries included! Everything you'd need in a website is included, including but not limited to templating and authentication. But, it does not include HTML, CSS, JS knowledge though, those are at a bring on your own basis. 

Python is powerful because of the packages people have developed, make use of them!
