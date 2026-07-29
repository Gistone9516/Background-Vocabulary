# -*- coding: utf-8 -*-
"""관계 인덱스. 코드의 "부분만 보이는" 편집이 만드는 결함을 자리 수로 잡는다.

세션은 시스템 전체를 들고 있지 못한다. 그래서 결함은 늘 같은 서명을 갖는다.
국소적으로 타당하고 전체적으로 틀린 것. 그 관계를 사람이 기억하는 대신 여기서 센다.

만드는 것 두 가지.
  relation-index.txt  커밋한다. 이 파일의 diff가 신호다. 필드를 추가하면 readers=0 줄이 뜬다.
  종료 코드          정당한 예외가 없는 위반만 실패로 만든다.

타입 체커가 없으므로 심볼 해석은 import/export 그래프로 직접 만든다.
이 코드베이스에서 성립하는 이유는 boundary-check가 딥임포트를 이미 금지해
모듈 그래프가 배럴 경유로 규칙적이기 때문이다. 그 규율이 없으면 이 방식은 못 쓴다.
"""
import io
import json
import os
import re
import sys
import collections

import tree_sitter_typescript as tsts
import tree_sitter_css as tscss
from tree_sitter import Language, Parser

HERE = os.path.dirname(os.path.abspath(__file__))
APP_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PKG_ROOT = os.path.join(APP_ROOT, "packages")
OUT_PATH = os.path.join(APP_ROOT, "relation-index.txt")

LANG_TS = Language(tsts.language_typescript())
LANG_TSX = Language(tsts.language_tsx())
LANG_CSS = Language(tscss.language())

# 요청 입력에서 오면 안 되는 결정. 서버가 강제하는 것은 서버만 정한다.
AUTH_NAMES = {"tier", "plan", "role", "scope", "admin", "is_paid", "paid", "entitlement"}
BODY_NAMES = {"body", "payload", "req", "request", "input", "raw"}
# 저장하면 안 되는 파생값을 자백하는 주석 표현.
# "정본" 하나만으로는 너무 넓다. 서버가 정본이라는 뜻으로도 쓰여 오탐이 난다(실측).
# 계산으로 다시 얻을 수 있다고 말하는 표현만 남긴다.
DERIVED_HINTS = ("재계산", "재산출", "파생", "recompute", "recalculat", "derived from")
# 값이 같으면 반드시 한 곳에서 와야 하는 상수. 여기 등록된 것만 중복을 실패로 만든다.
MUST_AGREE_LITERALS = {"deepseek-chat", "deepseek-reasoner"}
LITERAL_MIN_LEN = 6

# 설명된 예외. 사유 없이 넣지 않는다.
ALLOWLIST = [
    # {"rule": "identical_branch", "at": "path:line", "reason": "..."},
]


def rel(path):
    return os.path.relpath(path, APP_ROOT).replace("\\", "/")


def collect_files():
    out = []
    for dirpath, dirnames, filenames in os.walk(PKG_ROOT):
        dirnames[:] = [d for d in dirnames if d not in ("node_modules", "dist")]
        for name in filenames:
            # .mjs 게이트 스크립트도 소비처다. 빼면 게이트만 쓰는 심볼이 미사용으로 보인다.
            if name.endswith((".ts", ".tsx", ".css", ".mjs")):
                out.append(os.path.join(dirpath, name))
    return sorted(out)


def parse(path):
    src = io.open(path, "rb").read()
    if path.endswith(".css"):
        lang = LANG_CSS
    elif path.endswith(".tsx"):
        lang = LANG_TSX
    else:
        lang = LANG_TS  # .ts 와 .mjs 모두 TS 문법으로 파싱된다
    return src, Parser(lang).parse(src)


def text(src, node):
    return src[node.start_byte:node.end_byte].decode("utf-8", "replace")


def line_of(node):
    return node.start_point[0] + 1


def norm(s):
    return " ".join(s.split())


# CSS 치수, SVG 좌표, 모듈 스펙은 같은 값이 여러 곳에 나오는 것이 정상이다.
# 걸러내지 않으면 중복 리터럴 목록이 노이즈로 덮여 아무도 안 본다.
_UNIT = re.compile(r"^[\d.\s]+((rem|px|em|%|vh|vw|ms|s)\b[\d.\s]*)*$")


def is_meaningful_literal(v, node):
    if len(v) < LITERAL_MIN_LEN:
        return False
    if v.startswith((".", "/", "#", "@")):
        return False
    if _UNIT.match(v):
        return False
    # import/export 의 모듈 스펙은 중복이 당연하다
    p = node.parent
    if p is not None and p.type in ("import_statement", "export_statement"):
        return False
    return True


# ---------------------------------------------------------------- 사실 추출
class FileFacts(object):
    def __init__(self, path):
        self.path = path
        self.exports = {}        # 이름 -> "local" 또는 재수출 원본 스펙
        self.star_exports = []   # export * from "..." 의 스펙. 없으면 배럴 해석이 통째로 실패한다
        self.imports = []        # (로컬명, 원본명, 모듈스펙)
        self.ns_imports = []     # (네임스페이스명, 모듈스펙)  import * as N from "..."
        self.qualified = collections.Counter()  # (객체명, 속성명) -> 등장 수
        self.identifiers = collections.Counter()   # 이름 -> 등장 수
        self.properties = []     # (이름, 행)  속성 접근만. 선언은 members가 따로 센다
        self.members = []        # (소유타입, 멤버명, 행)  인터페이스 멤버 선언
        self.literals = []       # (값, 행)
        self.identical_branches = []   # (행, 종류)
        self.auth_from_input = []      # (행, 표현)
        self.derived_stored = []       # (행, 멤버명, 주석)
        self.class_tokens = set()      # tsx의 className 토큰
        self.css_classes = []          # (클래스명, 행)


def extract_ts(path, src, tree, f):
    root = tree.root_node
    # 주석은 줄 번호로 모은다. 앞줄 주석과 같은 줄 뒤 주석을 둘 다 봐야 한다.
    # 앞줄만 보면 `turns_left: number; // 재계산이 정본` 같은 형태를 통째로 놓친다(실측).
    # 반드시 먼저 모은다. 한 순회에 섞으면 같은 줄 뒤 주석은 아직 안 모인 상태로 판정된다(실측).
    comments = collections.defaultdict(list)

    def collect_comments(n):
        if n.type == "comment":
            comments[n.start_point[0]].append(text(src, n))
        for c in n.children:
            collect_comments(c)

    collect_comments(root)

    def visit(n, owner):
        t = n.type

        if t == "export_statement":
            decl = n.child_by_field_name("declaration")
            source = n.child_by_field_name("source")
            if decl is not None:
                nm = decl.child_by_field_name("name")
                if nm is not None:
                    f.exports[text(src, nm)] = "local"
                else:
                    # const/let 선언은 variable_declarator 안에 이름이 있다
                    for d in decl.children:
                        if d.type == "variable_declarator":
                            vn = d.child_by_field_name("name")
                            if vn is not None:
                                f.exports[text(src, vn)] = "local"
            # export * from "..." 은 declaration도 export_clause도 없다. 이걸 빠뜨리면
            # 배럴이 아무것도 수출하지 않는 것으로 보여 소비처 계산이 전부 0이 된다.
            if source is not None and decl is None and not any(c.type == "export_clause" for c in n.children):
                f.star_exports.append(text(src, source)[1:-1])
            for c in n.children:
                if c.type == "export_clause":
                    for spec in c.children:
                        if spec.type != "export_specifier":
                            continue
                        nm = spec.child_by_field_name("name")
                        alias = spec.child_by_field_name("alias")
                        exposed = text(src, alias) if alias is not None else text(src, nm)
                        origin = text(src, source)[1:-1] if source is not None else "local"
                        f.exports[exposed] = origin
                        if origin != "local" and alias is not None:
                            # 재수출하며 이름을 바꾼 경우 원본명을 함께 남긴다
                            f.exports[exposed] = origin + "#" + text(src, nm)

        elif t == "import_statement":
            source = n.child_by_field_name("source")
            spec = text(src, source)[1:-1] if source is not None else ""
            for c in n.children:
                if c.type != "import_clause":
                    continue
                for named in c.children:
                    if named.type == "namespace_import":
                        # import * as N from "..."  N.member 접근으로 소비된다
                        for k in named.children:
                            if k.type == "identifier":
                                f.ns_imports.append((text(src, k), spec))
                        continue
                    if named.type != "named_imports":
                        continue
                    for s in named.children:
                        if s.type != "import_specifier":
                            continue
                        nm = s.child_by_field_name("name")
                        alias = s.child_by_field_name("alias")
                        local = text(src, alias) if alias is not None else text(src, nm)
                        f.imports.append((local, text(src, nm), spec))

        elif t == "interface_declaration":
            nm = n.child_by_field_name("name")
            owner = text(src, nm) if nm is not None else owner

        elif t == "property_signature":
            nm = n.child_by_field_name("name")
            if nm is not None:
                member = text(src, nm)
                f.members.append((owner or "?", member, line_of(n)))
                near = comments.get(n.start_point[0], []) + comments.get(n.start_point[0] - 1, [])
                for cmt in near:
                    if any(h in cmt for h in DERIVED_HINTS):
                        f.derived_stored.append((line_of(n), member, norm(cmt)[:90]))
                        break

        elif t in ("identifier", "type_identifier", "nested_type_identifier"):
            # 타입 참조는 identifier가 아니라 type_identifier다. 빠뜨리면 타입 전용 심볼이
            # 전부 미사용으로 잡힌다(실측: 264개 중 154개가 거짓 0이었다).
            f.identifiers[text(src, n)] += 1

        elif t == "property_identifier":
            # 선언(property_signature의 이름)은 사용이 아니다. 섞으면 아무도 안 읽는 필드가
            # 자기 선언 때문에 사용된 것으로 보인다.
            if n.parent is None or n.parent.type != "property_signature":
                f.properties.append((text(src, n), line_of(n)))

        elif t in ("string", "number"):
            v = text(src, n).strip("\"'`")
            if is_meaningful_literal(v, n):
                f.literals.append((v, line_of(n)))

        elif t == "ternary_expression":
            a = n.child_by_field_name("consequence")
            b = n.child_by_field_name("alternative")
            if a is not None and b is not None and norm(text(src, a)) == norm(text(src, b)):
                f.identical_branches.append((line_of(n), "ternary"))

        elif t == "if_statement":
            a = n.child_by_field_name("consequence")
            b = n.child_by_field_name("alternative")
            if a is not None and b is not None:
                bt = text(src, b)
                bt = bt[4:].strip() if bt.startswith("else") else bt
                if norm(text(src, a)) == norm(bt):
                    f.identical_branches.append((line_of(n), "if"))

        elif t == "member_expression":
            obj = n.child_by_field_name("object")
            prop = n.child_by_field_name("property")
            if obj is not None and prop is not None and obj.type == "identifier":
                o = text(src, obj)
                p = text(src, prop)
                f.qualified[(o, p)] += 1
                if o.lower() in BODY_NAMES and p.lower() in AUTH_NAMES:
                    f.auth_from_input.append((line_of(n), o + "." + p))

        for c in n.children:
            visit(c, owner)

    visit(root, None)

    # className 토큰(템플릿 문자열 안까지)
    for m in re.finditer(r'className\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|\{`([^`]*)`\}|\{([^}]*)\})',
                         src.decode("utf-8", "replace")):
        chunk = " ".join(g for g in m.groups() if g)
        for tok in re.findall(r"[A-Za-z][\w-]*", chunk):
            f.class_tokens.add(tok)


def extract_css(path, src, tree, f):
    # 의사 클래스(:root, :hover, :first-child)도 class_name 노드로 잡힌다.
    # 걸러내지 않으면 죽은 클래스 목록이 통째로 오염된다(실측: 162건 중 상당수가 이것이었다).
    def visit(n):
        if n.type == "class_name":
            p = n.parent
            if p is None or "pseudo" not in p.type:
                f.css_classes.append((text(src, n), line_of(n)))
        for c in n.children:
            visit(c)
    visit(tree.root_node)


# ---------------------------------------------------------------- 모듈 해석
def resolve_spec(from_file, spec, by_path):
    if spec.startswith("."):
        base = os.path.normpath(os.path.join(os.path.dirname(from_file), spec))
        for cand in (base, base[:-3] if base.endswith(".js") else base):
            for ext in (".ts", ".tsx", "/index.ts", "/index.tsx"):
                p = cand + ext
                if p in by_path:
                    return p
        return None
    if spec.startswith("@vock/"):
        pkg = spec.split("/", 1)[1]
        for cand in (os.path.join(PKG_ROOT, pkg, "src", "index.ts"),
                     os.path.join(PKG_ROOT, "adapters", pkg, "src", "index.ts")):
            if cand in by_path:
                return cand
        return None
    return None  # 외부 의존성


def all_exported_names(file_path, by_path, facts, depth=0, seen=None):
    """배럴이 밖으로 내보내는 이름 전체(별표 재수출 포함)."""
    if seen is None:
        seen = set()
    if depth > 8 or file_path in seen or file_path not in facts:
        return set()
    seen.add(file_path)
    names = set(facts[file_path].exports)
    for spec in facts[file_path].star_exports:
        nxt = resolve_spec(file_path, spec, by_path)
        if nxt is not None:
            names |= all_exported_names(nxt, by_path, facts, depth + 1, seen)
    return names


def declaring_file(file_path, name, by_path, facts, depth=0):
    """배럴 재수출을 따라 실제 선언 파일까지 내려간다."""
    if depth > 8 or file_path not in facts:
        return None, name
    origin = facts[file_path].exports.get(name)
    if origin is None:
        # export * 로 흘려보낸 이름은 대상 파일들을 차례로 따라간다
        for spec in facts[file_path].star_exports:
            nxt = resolve_spec(file_path, spec, by_path)
            if nxt is None:
                continue
            got, gname = declaring_file(nxt, name, by_path, facts, depth + 1)
            if got is not None:
                return got, gname
        return None, name
    if origin == "local":
        return file_path, name
    spec, _, orig_name = origin.partition("#")
    nxt = resolve_spec(file_path, spec, by_path)
    if nxt is None:
        return None, name
    return declaring_file(nxt, orig_name or name, by_path, facts, depth + 1)


# ---------------------------------------------------------------- 본체
def main():
    files = collect_files()
    facts = {}
    for path in files:
        src, tree = parse(path)
        f = FileFacts(path)
        if path.endswith(".css"):
            extract_css(path, src, tree, f)
        else:
            extract_ts(path, src, tree, f)
        facts[path] = f
    by_path = set(files)

    # 1) 심볼 소비처: 그 이름을 실제로 import 한 파일에서만 센다
    readers = collections.defaultdict(list)   # (선언파일, 이름) -> [소비파일]
    for path, f in facts.items():
        for local, orig, spec in f.imports:
            target = resolve_spec(path, spec, by_path)
            if target is None:
                continue
            decl, name = declaring_file(target, orig, by_path, facts)
            if decl is None:
                continue
            uses = f.identifiers.get(local, 0) - 1   # import 문 자체를 뺀다
            if uses > 0:
                readers[(decl, name)].append(rel(path))

        # 네임스페이스 임포트는 N.member 로 소비된다
        for ns, spec in f.ns_imports:
            target = resolve_spec(path, spec, by_path)
            if target is None:
                continue
            for name in all_exported_names(target, by_path, facts):
                if f.qualified.get((ns, name), 0) <= 0:
                    continue
                decl, dname = declaring_file(target, name, by_path, facts)
                if decl is not None:
                    readers[(decl, dname)].append(rel(path))

    exported = []
    for path, f in facts.items():
        for name, origin in f.exports.items():
            if origin == "local":
                exported.append((path, name))

    # 2) 멤버 소비처: 이름 기반 전 저장소 집계.
    #    0건은 확실한 신호이고, 1건 이상은 후보일 뿐이다(타입 체커가 없으므로).
    prop_uses = collections.Counter()
    for path, f in facts.items():
        for name, _line in f.properties:
            prop_uses[name] += 1

    # 3) 리터럴 중복
    lit_files = collections.defaultdict(set)
    for path, f in facts.items():
        for v, _line in f.literals:
            lit_files[v].add(rel(path))

    # ------------------------------------------------------------ 인덱스 출력
    lines = []
    lines.append("# 관계 인덱스. 생성물이므로 손으로 고치지 않는다. diff가 신호다.")
    lines.append("# readers=0 은 실패가 아니라 검토 신호다. 다음 슬라이스가 쓸 정당한 미사용이 있다.")
    lines.append("")

    lines.append("## exported-symbols")
    for path, name in sorted(exported, key=lambda x: (rel(x[0]), x[1])):
        who = readers.get((path, name), [])
        lines.append("%s::%s readers=%d%s" % (rel(path), name, len(who),
                                              ("  <- " + ",".join(sorted(who)[:3])) if who else ""))
    lines.append("")

    lines.append("## interface-members (사용 0건만, 이름 기반이라 0만 확실하다)")
    for path, f in sorted(facts.items(), key=lambda x: rel(x[0])):
        for owner, member, ln in f.members:
            # 선언 자체가 property_identifier로 1회 잡히므로 1 이하이면 아무도 안 읽는다
            if prop_uses.get(member, 0) <= 1:
                lines.append("%s:%d %s.%s readers=0" % (rel(path), ln, owner, member))
    lines.append("")

    lines.append("## duplicate-literals")
    for v in sorted(lit_files):
        if len(lit_files[v]) >= 2:
            lines.append('"%s" defs=%d %s' % (v, len(lit_files[v]), ",".join(sorted(lit_files[v]))))
    lines.append("")

    lines.append("## css-classes-unused (기준선이지 결함 목록이 아니다)")
    lines.append("# 아직 안 만든 화면의 클래스와 정말 죽은 클래스를 구분하지 못한다.")
    lines.append("# 쓸모는 diff에 있다. 쓰이던 클래스가 이 목록에 새로 들어오면 그때가 신호다.")
    used = set()
    for f in facts.values():
        used |= f.class_tokens
    for path, f in sorted(facts.items(), key=lambda x: rel(x[0])):
        seen = set()
        for cls, ln in f.css_classes:
            if cls in used or cls in seen:
                continue
            seen.add(cls)
            lines.append("%s:%d .%s" % (rel(path), ln, cls))
    lines.append("")

    lines.append("## derived-but-stored (주석이 파생임을 자백한 필드)")
    for path, f in sorted(facts.items(), key=lambda x: rel(x[0])):
        for ln, member, cmt in f.derived_stored:
            lines.append("%s:%d %s  // %s" % (rel(path), ln, member, cmt))
    lines.append("")

    io.open(OUT_PATH, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")

    # ------------------------------------------------------------ 하드 위반
    def allowed(rule, at):
        return any(a.get("rule") == rule and a.get("at") == at for a in ALLOWLIST)

    violations = []
    for path, f in sorted(facts.items(), key=lambda x: rel(x[0])):
        for ln, kind in f.identical_branches:
            at = "%s:%d" % (rel(path), ln)
            if not allowed("identical_branch", at):
                violations.append("%s  %s 양쪽이 동일해 구별력이 없다" % (at, kind))
        for ln, expr in f.auth_from_input:
            at = "%s:%d" % (rel(path), ln)
            if not allowed("auth_from_input", at):
                violations.append("%s  권한이 요청 입력에서 온다: %s" % (at, expr))
    for v in sorted(MUST_AGREE_LITERALS):
        where = lit_files.get(v, set())
        if len(where) >= 2 and not allowed("must_agree_literal", v):
            violations.append('"%s"  합의 상수가 %d곳에 각각 정의됨: %s' % (v, len(where), ",".join(sorted(where))))

    print("관계 인덱스 생성: %s" % rel(OUT_PATH))
    print("  파일 %d, 수출 심볼 %d, 소비처 0인 수출 %d" % (
        len(files), len(exported), sum(1 for p, n in exported if not readers.get((p, n)))))
    if violations:
        print("관계 게이트 실패 — 설명되지 않은 위반 %d건:" % len(violations), file=sys.stderr)
        for v in violations:
            print("  " + v, file=sys.stderr)
        return 1
    print("관계 게이트 통과: 설명되지 않은 위반 0건(등록 예외 %d건)." % len(ALLOWLIST))
    return 0


if __name__ == "__main__":
    sys.exit(main())
