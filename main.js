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
// Path to the Python interpreter.
var PYTHON;
// The critic namespace object.
var critic;

function setup(critic_in, data)
{
  PYTHON = data.python;
  critic = critic_in;

  try
  {
    Module.load(CONFIG_JS);
  }
  catch (exception)
  {
  }
}

function helperArgs()
{
  if (!JIRA_API_URL)
    throw new critic.Error("Jira support not configured (no Jira API URL set)");

  var result = [PYTHON, BTS_PY,
                "--api-url", JIRA_API_URL];
  if (CREDENTIALS)
    result.push("--credentials", CREDENTIALS);
  if (CUSTOMFIELDS)
    result.push("--custom-fields", CUSTOMFIELDS);
  [].push.apply(result, arguments);
  return result;
}

function get_issue(key)
{
  var process = new OS.Process(PYTHON, { argv: helperArgs("--get-issue", key) });
  return process.call();
}

function CriticBTSIssue(key, source)
{
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

  if (!source)
    source = get_issue(key);

  var data = JSON.parse(source);

  if (typeof data == "string")
    throw new critic.Error(format("%s: invalid issue key: %s", key, data));

  var reporter, assignee;

  this.key = data.key;

  if (data.errors)
    this.invalid = data.error_msg;
  else
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
            value = { name: value.name, fullname: value.fullname, email: value.email };
          }
        }
        this[name] = value;
        break;

      case "created":
      case "updated":
        this[name] = parseDate(value);
        break;

      default:
        this[name] = value;
        break;
      }
    }
  }

  Object.freeze(this);
}

function run()
{
  var process = new OS.Process(PYTHON, { argv: helperArgs.apply(null, arguments) });

  process.stdout = new IO.MemoryFile;
  process.stderr = new IO.MemoryFile;

  process.start();
  process.wait();

  if (process.exitStatus !== 0)
    if (process.exitStatus == 2)
      throw new critic.Error(JSON.parse(process.stdout.value).message);
    else
      throw new critic.Error(format("", process.stderr.value));

  return JSON.parse(process.stdout.value);
}

function getField(name)
{
  return run("--get-field", this.key, name);
}

function setField(name, value)
{
  run("--set-field", this.key, name, value);
}

function addComment(text)
{
  run("--add-comment", this.key, text);
}

CriticBTSIssue.prototype = Object.create(Object.prototype,
  {
    getField: { value: getField, writable: true, configurable: true },
    setField: { value: setField, writable: true, configurable: true },
    addComment: { value: addComment, writable: true, configurable: true }
  });

CriticBTSIssue.find = function (keys)
  {
    var argv = helperArgs();

    keys.forEach(
      function (key)
      {
        argv.push("--get-issue", key);
      });

    var process = new OS.Process(PYTHON, { argv: argv });

    process.stdout = new IO.MemoryFile;
    process.stderr = new IO.MemoryFile;

    process.start();
    process.wait();

    if (process.exitStatus !== 0)
      throw Error("bts.py failed: " + process.stderr.value);

    var output = process.stdout.value.decode().split(/\n/g);
    var result = [];

    for (var index = 0; index < keys.length; ++index)
    {
      var source = output[index];
      if (source)
      {
        try
        {
          result.push(new CriticBTSIssue(keys[index], source));
        }
        catch (error)
        {
          result.push(error.message);
        }
      }
    }
    return result;
  };

CriticBTSIssue.toString = function ()
  {
    return "function critic.bts.Issue() {}";
  };

Module.assign("name", "bts");
Module.assign("Issue", CriticBTSIssue);
