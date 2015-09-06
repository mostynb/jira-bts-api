Critic Jira BTS support
=======================

This is Critic extension library "extra"; a custom addition to the Javascript
library API available for use in Critic extensions. The added API allows simple
access to a Jira BTS system.

Installation
------------

To install this addition, first make sure there's a sub-directory `extras` in
the directory `/usr/share/critic/library/js/v8/`. If `/usr/share/critic/`
doesn't exist, it appears you installed Critic into some other location; if so,
replace the `/usr/share/critic/` part with wherever Critic was installed.

Then simply clone this repository into the `extras` directory.

Configuration
-------------

To configure the addition, create a file name `config.js` in the
`extras/jira-bts-api/` directory created in the previous step. In this file, one
Javascript variable must be assigned: `JIRA_API_URL`. Two more can be optionally
assigned: `CREDENTIALS` and `CUSTOMFIELDS`.

Example:

```
JIRA_API_URL = "https://bts.example.org/rest/api/latest/";
CREDENTIALS = "/var/lib/critic/bts/credentials.json";
CUSTOMFIELDS = "/var/lib/critic/bts/customfields.json";
```

The `CREDENTIALS` variable, if set, should be set to the path to a file
containing the following JSON text:

```
{ "username": "<Jira username>",
  "password": "<Jira password>" }
```

Since this file needs to contain a Jira user's password in plain text, it should
preferably only be readable by the `critic` system user.

The `CUSTOMFIELDS` variable, if set, should be set to the path to a file
containing the following JSON text:

```
{ "<some key>": "<customfield_NNNNN>",
  ... }
```

This makes `<some key>` available as a property on the BTS issue objects
available to Critic extensions, mapping to the specified Jira custom field.

Usage
-----

This extension API addition extends the Javascript envirionment available to
extensions by adding the Javascript "class" `critic.bts.Issue`. Issues in the
Jira BTS can be accessed simply by creating new objects of this class:

```
var my_issue = new critic.bts.Issue("ISSUE-1234");
```

The objects implement the following interface:

```
interface Issue {
  DOMString key;
  DOMString summary;
  DOMString description;
  DOMString status;
  DOMString resolution;
  DOMString priority;
  Date created;
  Date updated;
  User reporter;
  User assignee;

  DOMString getField(DOMString name);
  Object getFields(DOMString[] name);
  void setField(DOMString name, DOMString value);
  void setFields(Object fields);
  void addComment(DOMString text);
  IssueComment[] getComments();
  void deleteComment((IssueComment or DOMString) comment);

  static (Issue or DOMString)[] find(DOMString[] keys);
}

interface IssueComment {
  DOMString id;
  User author;
  Date created;
  Date updated;
  DOMString body;
}
```

The static `find()` method can be used to lookup multiple issues in one call. If
an item in the `keys` array given to the function is not a valid issue key, the
corresponding entry in the returned array will be an error message instead of an
`Issue` object.