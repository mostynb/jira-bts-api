/* -*- mode: js; indent-tabs-mode: nil -*- */

"use strict";

// Things we can hardcode
// ======================
// Path to the bts.py helper program.
var BTS_PY = Module.path + "/bts.py";
// Path to config.js.
var CONFIG_JS = Module.path + "/config.js";

// Things set by setup()
// =====================
// Base URL of the Jira system's JSON API.
var JIRA_API_URL = null;
// Path to JSON file defining BTS credentials.
var CREDENTIALS = null;
// Path to JSON file defining custom fields.
var CUSTOMFIELDS = null;

var CUSTOM_FIELDS = Object.create(null);
// Option which will be passed as parameter in URL.[put/get/post] call
var OPTIONS;
// The critic namespace object.
var critic;

function setup(critic_in)
{
  critic = critic_in;

  try
  {
    Module.load(CONFIG_JS);
  }
  catch (exception)
  {
  }

  if (CUSTOMFIELDS)
  {
    CUSTOM_FIELDS = JSON.parse(IO.File.read(CUSTOMFIELDS));
  }

  OPTIONS =
    {
      headers:
      {
        'Content-Type': 'application/json',
      }
    };

  if (CREDENTIALS)
  {
    var credentials = JSON.parse(IO.File.read(CREDENTIALS));
    OPTIONS.username = credentials.username;
    OPTIONS.password = credentials.password;
  }
}

function getEssentialFields(issue)
{
  var fields = ["created", "updated", "status", "resolution", "priority",
                "reporter", "assignee", "summary", "description"];
  fields = fields.concat(Object.keys(CUSTOM_FIELDS));
  return issue.getFields(fields);
}

function parseDate(string)
{
  try
  {
    var date = new Date(string);
    if (isNaN(date.valueOf()))
      throw false;
    return date;
  }
  catch (exception)
  {
    throw critic.Error(format("invalid date: %s", JSON.stringify(string)));
  }
}

// path and query should be encoded
function constructURL(path, query)
{
  if (!JIRA_API_URL)
    throw new critic.Error('Jira support not configured (no Jira API URL set)');

  return JIRA_API_URL + path + (query ? '?' + query : '');
}

function CriticBTSIssue(key)
{
  this.key = key;

  var data = getEssentialFields(this);

  if (data.errors)
    this.invalid = data.error_msg;
  else
  {
    for (var key in data)
    {
      this[key] = data[key];
    }
  }

  Object.freeze(this);
}

function getField(name)
{
  var fields = this.getFields([name]);
  return fields[name];
}

// Throw critic.Error when things go wrong.
function getFields(names)
{
  function processField(context, data, nameMap)
  {
    for (var name in data)
    {
      var value = data[name];
      switch (name)
      {
        case "reporter":
        case "assignee":
          if (value)
          {
            try
            {
              value = new critic.User({ name: value.name });
            }
            catch (e)
            {
              value = { name: value.name, fullname: value.displayName, email: value.emailAddress };
            }
          }
          context[name] = value;
          break;

        case "created":
        case "updated":
          context[name] = parseDate(value);
          break;
        case "status":
        case "priority":
          context[name] = value.name;
          break;
        case "resolution":
          context[name] = value && value.name;
          break;
        default:
          name = nameMap[name] || name;
          context[name] = value;
          break;
      }
    }
  }

  var nameMap = {};
  names = names.map(function (name) {
    var translate_name = CUSTOM_FIELDS[name];
    if (translate_name) {
      nameMap[translate_name] = name;
      return translate_name;
    }
    return name;
  });
  var query = 'fields=' + encodeURIComponent(names.join(','));
  var url = constructURL('issue/' + encodeURIComponent(this.key), query);
  var response = URL.get(url, OPTIONS);
  try {
    var json = JSON.parse(response);
    if (!json.fields) {
      throw new critic.Error('Unexpected response from Jira');
    }

    var result = {};
    processField(result, json.fields, nameMap);
    return result;
  } catch (e) {
    throw new critic.Error(e.message);
  }
}

function setField(name, value)
{
  var fields = {};
  fields[name] = value;
  this.setFields(fields);
}

function transformFields(fields, result)
{
  Object.keys(fields).
    forEach(function (field)
            {
              var value = fields[field];
              field = CUSTOM_FIELDS[field] || field;
              if (field === 'status' || field === 'resolution' || field === 'priority')
              {
                value = { name: value };
              }
              result[field] = value;
            });
}

function setFields(fields)
{
  var url = constructURL('issue/' + encodeURIComponent(this.key));
  var update_fields = {};

  transformFields(fields, update_fields);
  var data = JSON.stringify({ fields: update_fields });
  URL.put(url, data, OPTIONS);
}

function addComment(text)
{
  var url = constructURL('issue/' + encodeURIComponent(this.key) + '/comment');
  var data = JSON.stringify({ body: text });
  URL.post(url, data, OPTIONS);
}

function getComments()
{
  var url = constructURL('issue/' + encodeURIComponent(this.key) + '/comment');

  return JSON.parse(URL.get(url, OPTIONS));
}

function deleteComment(id)
{
  var url = constructURL('issue/' + encodeURIComponent(this.key) + '/comment/' + encodeURIComponent(id));

  URL.delete(url, OPTIONS);
}

CriticBTSIssue.prototype = Object.create(Object.prototype,
  {
    getField: { value: getField, writable: true, configurable: true },
    getFields: { value: getFields, writable: true, configurable: true },
    setField: { value: setField, writable: true, configurable: true },
    setFields: { value: setFields, writable: true, configurable: true },
    addComment: { value: addComment, writable: true, configurable: true },
    getComments: { value: getComments, writable: true, configurable: true },
    deleteComment: { value: deleteComment, writable: true, configurable: true },
  });

CriticBTSIssue.find = function (keys)
  {
    return keys.map(function (key) {
      try {
        return new CriticBTSIssue(key);
      } catch (e) {
        return e.message;
      }
    });
  };

CriticBTSIssue.toString = function ()
  {
    return "function critic.bts.Issue() {}";
  };

Module.assign("name", "bts");
Module.assign("Issue", CriticBTSIssue);
