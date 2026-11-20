import test from "node:test";
import assert from "node:assert/strict";
import {
  customerGuardQuestions,
  fillUnansweredGuardQuestions,
  GUARD_DEFAULT_ACORD_ANSWERS,
} from "../src/services/guardService.js";

const returned = [
  {
    questionCd: "CANNABISOPERATIONS",
    questionText: "Any cannabis operations?",
    type: "SelectOne",
    options: [
      { label: "Yes", value: "Y" },
      { label: "No", value: "N" },
    ],
  },
  {
    questionCd: "com.guard_CLASS_ABOVE15",
    questionText: "Work above 15 feet?",
    type: "SelectOne",
    options: [
      { label: "Yes", value: "Y" },
      { label: "No", value: "N" },
    ],
  },
  {
    questionCd: "com.guard_PAYROLL",
    questionText: "Payroll",
    type: "Number",
    options: [],
  },
];

test("the customer list hides cannabis and keeps the class question", () => {
  const shown = customerGuardQuestions(returned);
  assert.deepEqual(
    shown.map((q) => q.questionCd),
    ["com.guard_CLASS_ABOVE15", "com.guard_PAYROLL"],
  );
});

test("a live quote sends cannabis as No and leaves the class question to the customer", () => {
  const answers = fillUnansweredGuardQuestions(returned, [], {
    onlyHidden: true,
  });
  const byCd = Object.fromEntries(answers.map((a) => [a.questionCd, a.response]));
  assert.equal(byCd.CANNABISOPERATIONS, "N");
  assert.equal(byCd["com.guard_CLASS_ABOVE15"], undefined);
  assert.equal(byCd["com.guard_PAYROLL"], undefined);
  for (const def of GUARD_DEFAULT_ACORD_ANSWERS) {
    assert.equal(byCd[def.questionCd], def.response);
  }
});

test("the test pack answers every yes/no GUARD returned, and a case answer wins", () => {
  const answers = fillUnansweredGuardQuestions(returned, [
    { questionCd: "com.guard_CLASS_ABOVE15", response: "Y" },
  ]);
  const byCd = Object.fromEntries(answers.map((a) => [a.questionCd, a.response]));
  assert.equal(byCd.CANNABISOPERATIONS, "N");
  assert.equal(byCd["com.guard_CLASS_ABOVE15"], "Y");
  assert.equal(byCd["com.guard_PAYROLL"], undefined);
});
