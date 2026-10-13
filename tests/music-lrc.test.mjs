import assert from "node:assert/strict";
import test from "node:test";
import { findActiveLine, parseLrc } from "../src/utils/music/lrc.ts";

test("parses metadata tags and timestamped lyric lines", () => {
	const parsed = parseLrc(
		[
			"[ti:Test Song]",
			"[ar:Some Artist]",
			"[al:An Album]",
			"[by:someone]",
			"[00:00.000] 作词 : ケリー",
			"[00:12.340]second line",
			"[01:05.000]third line",
		].join("\n"),
	);

	assert.deepEqual(parsed.metadata, {
		ti: "Test Song",
		ar: "Some Artist",
		al: "An Album",
		by: "someone",
	});
	assert.equal(parsed.lines.length, 3);
	assert.deepEqual(parsed.lines[0], { time: 0, text: "作词 : ケリー" });
	assert.deepEqual(parsed.lines[1], { time: 12.34, text: "second line" });
	assert.deepEqual(parsed.lines[2], { time: 65, text: "third line" });
});

test("accepts every fractional-second width, and none at all", () => {
	const one = (tag) => parseLrc(`${tag}text`).lines[0].time;
	assert.equal(one("[01:02]"), 62);
	assert.equal(one("[01:02.5]"), 62.5);
	assert.equal(one("[01:02.50]"), 62.5);
	assert.equal(one("[01:02.500]"), 62.5);
	// colon-separated hundredths also occur in the wild
	assert.equal(one("[01:02:50]"), 62.5);
});

test("one line with several timestamps expands into several entries", () => {
	const parsed = parseLrc("[00:12.00][00:56.00]repeated chorus");
	assert.equal(parsed.lines.length, 2);
	assert.deepEqual(parsed.lines, [
		{ time: 12, text: "repeated chorus" },
		{ time: 56, text: "repeated chorus" },
	]);
});

test("lines are sorted by time even when the file is out of order", () => {
	const parsed = parseLrc("[00:30.00]later\n[00:10.00]earlier");
	assert.deepEqual(
		parsed.lines.map((l) => l.text),
		["earlier", "later"],
	);
});

test("offset shifts every line (positive offset advances the lyrics)", () => {
	const early = parseLrc("[offset:500]\n[00:01.00]line");
	assert.equal(early.lines[0].time, 0.5);

	const late = parseLrc("[offset:-500]\n[00:01.00]line");
	assert.equal(late.lines[0].time, 1.5);

	// a shift must never produce a negative timestamp
	const clamped = parseLrc("[offset:5000]\n[00:01.00]line");
	assert.equal(clamped.lines[0].time, 0);
});

test("drops blank lines, metadata-only lines and untimed prose", () => {
	const parsed = parseLrc(
		["[ar:Artist]", "", "   ", "no timestamp here", "[00:05.00]", "[00:06.00]kept"].join("\n"),
	);
	assert.equal(parsed.lines.length, 1);
	assert.deepEqual(parsed.lines[0], { time: 6, text: "kept" });
});

test("tolerates a BOM and CRLF line endings (what a Windows-served .lrc looks like)", () => {
	const parsed = parseLrc("\uFEFF[ti:X]\r\n[00:01.00]a\r\n[00:02.00]b\r\n");
	assert.equal(parsed.metadata.ti, "X");
	assert.equal(parsed.lines.length, 2);
	assert.deepEqual(parsed.lines[1], { time: 2, text: "b" });
});

test("empty and non-string input yields an empty result, not a throw", () => {
	for (const bad of ["", null, undefined, 123]) {
		const parsed = parseLrc(bad);
		assert.equal(parsed.lines.length, 0);
		assert.deepEqual(parsed.metadata, {});
	}
});

test("a timestamp-only file (no lyrics at all) reports zero lines", () => {
	assert.equal(parseLrc("[00:01.00]\n[00:02.00]").lines.length, 0);
});

test("findActiveLine picks the last line at or before the current time", () => {
	const lines = parseLrc("[00:01.00]a\n[00:05.00]b\n[00:10.00]c").lines;

	assert.equal(findActiveLine(lines, 0.5), -1, "before the first line");
	assert.equal(findActiveLine(lines, 1), 0, "exactly on the first line");
	assert.equal(findActiveLine(lines, 4.99), 0, "between first and second");
	assert.equal(findActiveLine(lines, 5), 1, "exactly on the second line");
	assert.equal(findActiveLine(lines, 9.99), 1);
	assert.equal(findActiveLine(lines, 10), 2);
	assert.equal(findActiveLine(lines, 9999), 2, "after the last line");
});

test("findActiveLine degrades safely on empty input and non-finite time", () => {
	assert.equal(findActiveLine([], 3), -1);
	const lines = parseLrc("[00:01.00]a").lines;
	assert.equal(findActiveLine(lines, Number.NaN), -1);
	assert.equal(findActiveLine(lines, Number.POSITIVE_INFINITY), -1);
});

test("findActiveLine agrees with a linear scan across a dense timeline", () => {
	const source = Array.from({ length: 400 }, (_, i) => `[${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.00]line ${i}`).join("\n");
	const lines = parseLrc(source).lines;
	assert.equal(lines.length, 400);

	for (const probe of [0, 1, 37.5, 199, 399, 400, 12345]) {
		let expected = -1;
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].time <= probe) expected = i;
		}
		assert.equal(findActiveLine(lines, probe), expected, `probe ${probe}`);
	}
});
