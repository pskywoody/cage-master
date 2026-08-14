# -*- coding: utf-8 -*-
"""
test_rule_coverage.py —— Rule Coverage Matrix 批量回归测试
==========================================================
读取 engine_cases.json（正向 + 负向用例），逐个经 /api/v1/engine/judge
批量断言，建立「改 matcher 不破坏旧行为」的回归基线。

运行方式（本目录 backend-engine/）：
    ..\\run_engine_regression.ps1          # 一键跑（自动桥接 D:\\bestbay 引擎路径）
    或手动：
    $env:RULE_COV_SRC='D:\\bestbay\\backend\\src'
    $env:RULE_COV_CASES='<本目录>\\engine_cases.json'
    & $py 'test_rule_coverage.py'
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# 默认相对解析（若放入 backend/tests/ 则 SRC=backend/src、CASES=同目录 engine_cases.json），
# 亦可环境变量覆盖（本目录位于工作区，需桥接 D:\\bestbay 引擎路径）。
SRC = os.environ.get("RULE_COV_SRC", os.path.join(HERE, "..", "..", "bestbay", "backend", "src"))
CASES = os.environ.get("RULE_COV_CASES", os.path.join(HERE, "engine_cases.json"))

sys.path.insert(0, SRC)

from fastapi.testclient import TestClient  # noqa: E402
import main as engine_main  # noqa: E402

client = TestClient(engine_main.app)


def _load_cases():
    with open(CASES, "r", encoding="utf-8") as f:
        return json.load(f)


def _check(case):
    """单个用例断言。返回 (passed, msg)。"""
    fact = case["fact"]
    exp = case["expect"]
    exp_rules = exp.get("matched_rules", [])
    r = client.post("/api/v1/engine/judge", json=fact)
    assert r.status_code == 200, f"HTTP {r.status_code}: {r.text}"
    body = r.json()
    matched = body.get("matched_rules", [])
    out = body.get("merged_output", {})
    ui = out.get("ui_trigger", {})
    tags = out.get("tags", [])

    # 1) 命中规则集合必须精确等于期望（正向/负向都要求精确）
    if sorted(matched) != sorted(exp_rules):
        return False, f"命中规则 = {matched}，期望 = {exp_rules}"

    # 2) 可选字段断言
    if "show_popup" in exp:
        if ui.get("show_popup") != exp["show_popup"]:
            return False, f"show_popup = {ui.get('show_popup')}，期望 {exp['show_popup']}"
    if "force_quiz" in exp:
        if ui.get("force_quiz") != exp["force_quiz"]:
            return False, f"force_quiz = {ui.get('force_quiz')}，期望 {exp['force_quiz']}"
    if "add_to_weekend_pack" in exp:
        if ui.get("add_to_weekend_pack") != exp["add_to_weekend_pack"]:
            return False, f"add_to_weekend_pack = {ui.get('add_to_weekend_pack')}"
    for t in exp.get("tags", []):
        if t not in tags:
            return False, f"期望标签 {t}，实际 {tags}"
    if "diag_contains" in exp:
        diag = out.get("primary_diagnosis", "") + out.get("secondary_diagnosis", "")
        if exp["diag_contains"] not in diag:
            return False, f"诊断文案应含 '{exp['diag_contains']}'，实际 '{diag}'"
    return True, "ok"


def test_rule_coverage_all():
    cases = _load_cases()
    passed = 0
    failures = []
    for c in cases:
        ok, msg = _check(c)
        if ok:
            passed += 1
        else:
            failures.append((c.get("case"), c.get("rule"), msg))
    # 覆盖审计：17 条规则每条至少一个正向 case
    pos_rules = {c["rule"] for c in cases if c["category"] != "NEG"}
    assert len(pos_rules) == 17, f"正向覆盖不完整：{sorted(pos_rules)}（期望 17 条）"
    assert failures == [], f"{len(failures)} 个用例失败：{failures}"
    assert passed == len(cases), f"通过 {passed}/{len(cases)}"
    print(f"[OK] Rule Coverage :: {passed}/{len(cases)} 用例通过，17/17 规则覆盖")


if __name__ == "__main__":
    test_rule_coverage_all()
    print(f"[OK] {os.path.basename(__file__)} 全部通过")