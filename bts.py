import requests
import argparse
import json
import sys
import datetime
import re

API_URL = None
CUSTOMFIELDS = {}
CUSTOMFIELDS_REVERSED = {}

def toJSON(value):
    if isinstance(value, object) and hasattr(value, "toJSON"):
        return value.toJSON()
    else:
        return value

def parseDate(value):
    value = re.match(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,6})?", value).group(0)
    return datetime.datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%f")

class Issue(object):
    class Comment(object):
        def __init__(self, bts, data):
            self.__bts = bts
            self.__data = data

    def __init__(self, bts, data):
        self.__bts = bts
        self.__data = data
        self.__fields = data["fields"]

    @property
    def key(self): return self.__data["key"]
    @property
    def created(self): return parseDate(self.__fields["created"])
    @property
    def updated(self): return parseDate(self.__fields["updated"])
    @property
    def status(self): return self.__fields["status"]["name"]
    @property
    def resolution(self):
        if self.__fields["resolution"]:
            return self.__fields["resolution"]["name"]
        else:
            return None
    @property
    def priority(self): return self.__fields["priority"]["name"]
    @property
    def reporter(self): return User.fromJSON(self.__bts, self.__fields.get("reporter"))
    @property
    def assignee(self): return User.fromJSON(self.__bts, self.__fields.get("assignee"))
    @property
    def summary(self): return self.__fields["summary"]
    @property
    def description(self): return self.__fields["description"]

    def getField(self, field):
        if hasattr(self, field):
            return getattr(self, field)
        if field in CUSTOMFIELDS:
            field = CUSTOMFIELDS[field]
        if field in self.__fields:
            return self.__fields[field]
        return self.__data.get(field)

    def toJSON(self):
        result = { "key": self.key,
                   "created": self.created.isoformat(),
                   "updated": self.updated.isoformat(),
                   "status": self.status,
                   "resolution": self.resolution,
                   "priority": self.priority,
                   "reporter": toJSON(self.reporter),
                   "assignee": toJSON(self.assignee),
                   "summary": self.summary,
                   "description": self.description }
        for key, custom_key in CUSTOMFIELDS.items():
            if custom_key in self.__fields:
                result[key] = self.__fields[custom_key]
        return result

class User(object):
    def __init__(self, bts, data):
        self.__bts = bts
        self.__data = data

    @property
    def name(self): return self.__data["name"]
    @property
    def fullname(self): return self.__data["displayName"]
    @property
    def email(self): return self.__data["emailAddress"]

    @staticmethod
    def fromJSON(bts, value):
        if value:
            return User(bts, value)
        return None

    def toJSON(self):
        return { "name": self.name,
                 "fullname": self.fullname,
                 "email": self.email }

class BTS(object):
    def __init__(self, api_url, credentials):
        self.api_url = api_url
        if credentials:
            self.auth = (credentials["username"],
                         credentials["password"])
        else:
            self.auth = None

    def get(self, url, params={}):
        response = requests.get(
            self.api_url + url,
            auth=self.auth,
            params=params,
            verify=False)
        response.raise_for_status()
        return response.json

    def post(self, url, data, params={}):
        response = requests.post(
            self.api_url + url,
            auth=self.auth,
            params=params,
            headers={ "content-type": "application/json" },
            data=json.dumps(data),
            verify=False)
        response.raise_for_status()
        return response.json

    def put(self, url, data, params={}):
        response = requests.put(
            self.api_url + url,
            auth=self.auth,
            params=params,
            headers={ "content-type": "application/json" },
            data=json.dumps(data),
            verify=False)
        response.raise_for_status()
        return response.json

    def getIssue(self, key):
        fields = ["created", "updated", "status", "resolution", "priority",
                  "reporter", "assignee", "summary", "description"]
        fields.extend(CUSTOMFIELDS.values())
        data = self.get(
            "issue/" + key,
            params={ "fields": ",".join(fields) })
        return Issue(self, data)

    def getUser(self, name):
        if name:
            return User(self, self.service.getUser(self.auth, name))
        else:
            return None

    def getField(self, key, field):
        return self.getIssue(key).getField(field)

    def setField(self, key, field, value):
        if field in CUSTOMFIELDS:
            field = CUSTOMFIELDS[field]
        if field in ("status", "resolution", "priority"):
            value = { "name": value }
        self.put(
            "issue/" + key,
            data={ "update": { field: [{ "set": value }] }})

    def addComment(self, key, text):
        self.post(
            "issue/%s/comment" % key,
            data={ "body": text })

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BTS access utility")

    parser.add_argument("--api-url", required=True,
                        help="Base URL of the Jira system's JSON API")
    parser.add_argument("--credentials",
                        help="Path to BTS credentials JSON")
    parser.add_argument("--custom-fields",
                        help="Path to custom fields JSON")
    parser.add_argument("--get-issue", action="append", metavar="ISSUE_KEY",
                        help="Fetch basic issue information")
    parser.add_argument("--get-field", nargs=2, action="append",
                        metavar=("ISSUE_KEY", "FIELD_NAME"),
                        help="Get a field")
    parser.add_argument("--set-field", nargs=3, action="append",
                        metavar=("ISSUE_KEY", "FIELD_NAME", "VALUE"),
                        help="Set a field")
    parser.add_argument("--add-comment", nargs=2, action="append",
                        metavar="ISSUE_KEY TEXT",
                        help="Add a comment to an issue")

    arguments = parser.parse_args()

    if arguments.credentials:
        with open(arguments.credentials) as credentials_file:
            credentials = json.load(credentials_file)
    else:
        credentials = None

    if arguments.custom_fields:
        with open(arguments.custom_fields) as custom_fields_file:
            CUSTOMFIELDS = json.load(custom_fields_file)
            CUSTOMFIELDS_REVERSED = { value: key
                                      for key, value
                                      in CUSTOMFIELDS.items() }

    bts = BTS(arguments.api_url, credentials)

    try:
        if arguments.get_issue:
            for key in arguments.get_issue:
                try:
                    issue = bts.getIssue(key)
                except Exception as error:
                    issue = str(error)
                print json.dumps(toJSON(issue))

        if arguments.get_field:
            for key, field in arguments.get_field:
                print json.dumps(bts.getField(key, field))

        if arguments.set_field:
            for key, field, value in arguments.set_field:
                bts.setField(key, field, value)
                print json.dumps({})

        if arguments.add_comment:
            for key, text in arguments.add_comment:
                bts.addComment(key, text)
                print json.dumps({})
    except requests.exceptions.HTTPError as error:
        if 400 <= error.response.status_code < 500:
            data = error.response.json
            messages = []
            if "errorMessages" in data:
                messages.extend(data["errorMessages"])
            if "errors" in data:
                for key, message in data["errors"].items():
                    messages.append(message)
            print json.dumps({ "message": "\n".join(messages) })
            sys.exit(2)
        raise
