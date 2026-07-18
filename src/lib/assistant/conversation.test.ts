import assert from "node:assert/strict";
import test from "node:test";
import { answerLocalConversation } from "./query";

test("common greetings are answered locally without provider usage", () => {
  assert.match(answerLocalConversation("你好！") ?? "", /博客/);
  assert.match(answerLocalConversation("Thanks") ?? "", /不客气/);
  assert.match(answerLocalConversation("再见") ?? "", /再见/);
});

test("blog questions continue to the grounded retrieval path", () => {
  assert.equal(answerLocalConversation("博客部署时遇到了什么问题？"), null);
});
