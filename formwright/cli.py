import sys


def main():
    from .__main__ import main as dispatch
    return dispatch(sys.argv[1:])
