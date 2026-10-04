import assert from "node:assert/strict";
import test from "node:test";
import { ASSISTANT_GREETINGS, parseAssistantAnswer, pickAssistantGreeting } from "./ui";

test("four short local greetings introduce existing public features", () => {
  assert.equal(new Set(ASSISTANT_GREETINGS).size, 4);
  for (const greeting of ASSISTANT_GREETINGS) { assert.ok(greeting.length < 100); assert.doesNotMatch(greeting, /语音|麦克风|注册|私密/); }
  assert.equal(pickAssistantGreeting(0), ASSISTANT_GREETINGS[0]);
  assert.equal(pickAssistantGreeting(.3), ASSISTANT_GREETINGS[1]);
  assert.equal(pickAssistantGreeting(.6), ASSISTANT_GREETINGS[2]);
  assert.equal(pickAssistantGreeting(1), ASSISTANT_GREETINGS[3]);
  assert.equal(pickAssistantGreeting(NaN), ASSISTANT_GREETINGS[0]);
});

test("chat retains grounded sources but rejects unsafe links and malformed data", () => {
  const answer = { answer: "测试回答", confidence: "high", mode: "grounded", sources: [{ postId: "p", title: "原文", url: "/posts/example-post", excerpt: "片段" }] };
  assert.deepEqual(parseAssistantAnswer(answer), answer);
  for (const url of ["javascript:alert(1)", "https://other.example/posts/a", "//other.example", "/admin"]) assert.throws(() => parseAssistantAnswer({ ...answer, sources: [{ ...answer.sources[0], url }] }));
  assert.throws(() => parseAssistantAnswer({ answer: null }));
});
