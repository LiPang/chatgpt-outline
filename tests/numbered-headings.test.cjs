"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../chatgpt-outline/outline-core.js"), "utf8"), context);
const { isNumberedHeading, inferHeadingLevels } = context.ChatGPTOutlineCore;

test("Bare part labels and punctuation are not paragraph headings", () => {
  const labels = [
    "第一部分：", "第二部分:", "第1部分：", "第一部分", "第一部", "第二章：", "第2节：",
    "第一部分：——", "一、", "二：…", "（一）", "1.", "1.1", "1.1：", "1.1.1 …"
  ];
  for (const label of labels) {
    assert.equal(isNumberedHeading(label), false, label);
    assert.equal(isNumberedHeading(label, true), false, label);
  }
});

test("Complete numbered headings still support Chinese and emphasized numeric titles", () => {
  for (const title of ["第一部分：准备工具", "第二部分: 开始冲煮", "第1章：基础", "第2节 基础", "一、准备工具", "（一）选择滤杯"]) {
    assert.equal(isNumberedHeading(title), true, title);
  }
  for (const title of ["1. Tools", "1.1 滤纸", "1.2: 电子秤", "1.1.1 Detail"]) {
    assert.equal(isNumberedHeading(title), false, title);
    assert.equal(isNumberedHeading(title, true), true, title);
  }
});

test("Explanatory part labels cannot reset an existing three-level outline", () => {
  const candidates = [
    { text: "第一部分：准备工具", sourceLevel: 1 },
    { text: "一、选择滤杯", sourceLevel: 2 },
    { text: "1.1 滤纸", sourceLevel: 3 },
    { text: "第二部分：开始冲煮", sourceLevel: 1 },
    { text: "一、注水", sourceLevel: 2 },
    { text: "1.1 控制流量", sourceLevel: 3 },
    { text: "第一部分：", sourceLevel: null },
    { text: "第二部分：", sourceLevel: null },
    { text: "二、完成", sourceLevel: 1 },
    { text: "2.1 结束注水", sourceLevel: 2 }
  ];
  const headings = candidates.filter((item) => item.sourceLevel !== null || isNumberedHeading(item.text));
  const levels = Array.from(inferHeadingLevels(headings), (item) => item.level);
  assert.deepEqual(levels, [1, 2, 3, 1, 2, 3, 2, 3]);
});
