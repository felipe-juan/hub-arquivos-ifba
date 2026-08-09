#!/usr/bin/env python3
"""Remove assets estáveis do Assistente/sidebar do pipeline de hash usando AST.

A sidebar canônica e o frontend do Assistente usam caminhos estáveis no cache.
Versões anteriores do build ainda podiam incluí-los em APP_LEAVES, gerar hashes
e reescrever o service worker para arquivos transitórios. O reparo altera apenas
literais estruturados do script; não usa regex nem substituição textual frágil.
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

STABLE_UNHASHED = {
    "apps/app-shell.js",
    "apps/app-shell.css",
    "apps/assistente/app.js",
    "apps/assistente/app.css",
    "apps/assistente/config.js",
    "apps/assistente/offline-data.json",
    "sidebar/sidebar.js",
    "sidebar/sidebar.css",
    "sidebar/hub-url-resolver.js",
    "sidebar/hub-user-state.js",
    "sidebar/hub-registry.json",
    "sidebar/apps-registry.json",
}


def normalized(value: str) -> str:
    return value.replace("\\", "/").removeprefix("./")


def is_obsolete(value: object) -> bool:
    return isinstance(value, str) and normalized(value) in STABLE_UNHASHED


def strip_obsolete(node: ast.AST) -> tuple[ast.AST | None, bool]:
    """Remove literais que devem permanecer sem hash de coleções literais, preservando a estrutura."""
    if isinstance(node, ast.Constant):
        if is_obsolete(node.value):
            return None, True
        return node, False

    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        changed = False
        elements: list[ast.AST] = []
        for element in node.elts:
            transformed, item_changed = strip_obsolete(element)
            changed = changed or item_changed
            if transformed is not None:
                elements.append(transformed)
        node.elts = elements
        return node, changed

    if isinstance(node, ast.Dict):
        changed = False
        keys: list[ast.AST | None] = []
        values: list[ast.AST] = []
        for key, value in zip(node.keys, node.values):
            new_key, key_changed = (strip_obsolete(key) if key is not None else (None, False))
            new_value, value_changed = strip_obsolete(value)
            changed = changed or key_changed or value_changed
            if new_key is None or new_value is None:
                # Se a chave ou o valor inteiro é o caminho estável excluído, removemos o par.
                continue
            keys.append(new_key)
            values.append(new_value)
        node.keys = keys
        node.values = values
        return node, changed

    # Expressões compostas não são reescritas implicitamente. Se contiverem um
    # caminho estável excluído, a validação final abaixo interromperá com diagnóstico.
    return node, False


def assignment_names(node: ast.Assign | ast.AnnAssign) -> set[str]:
    targets = node.targets if isinstance(node, ast.Assign) else [node.target]
    names: set[str] = set()
    for target in targets:
        if isinstance(target, ast.Name):
            names.add(target.id)
    return names


def offsets(source: str) -> list[int]:
    starts = [0]
    total = 0
    for line in source.splitlines(keepends=True):
        total += len(line)
        starts.append(total)
    return starts


def main() -> int:
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
    path = root / "scripts" / "build_production_assets.py"
    if not path.is_file():
        print("build_production_assets.py ausente; nenhum reparo necessário.")
        return 0

    source = path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as error:
        raise SystemExit(f"Não foi possível analisar {path}: {error}")

    replacements: list[tuple[int, int, str]] = []
    line_starts = offsets(source)
    changed_names: set[str] = set()

    for statement in tree.body:
        if not isinstance(statement, (ast.Assign, ast.AnnAssign)):
            continue
        value = statement.value
        if value is None:
            continue
        transformed, changed = strip_obsolete(value)
        if not changed or transformed is None:
            continue
        statement.value = transformed
        ast.fix_missing_locations(statement)
        if statement.end_lineno is None or statement.end_col_offset is None:
            raise SystemExit("O Python não forneceu posições completas para atualizar o build.")
        start = line_starts[statement.lineno - 1] + statement.col_offset
        end = line_starts[statement.end_lineno - 1] + statement.end_col_offset
        replacements.append((start, end, ast.unparse(statement)))
        changed_names.update(assignment_names(statement))

    for start, end, replacement in sorted(replacements, reverse=True):
        source = source[:start] + replacement + source[end:]

    try:
        final_tree = ast.parse(source, filename=str(path))
    except SyntaxError as error:
        raise SystemExit(f"O reparo gerou Python inválido em {path}: {error}")

    remaining: set[str] = set()
    for statement in final_tree.body:
        if not isinstance(statement, (ast.Assign, ast.AnnAssign)) or statement.value is None:
            continue
        for node in ast.walk(statement.value):
            if isinstance(node, ast.Constant) and is_obsolete(node.value):
                remaining.add(normalized(node.value))
    if remaining:
        joined = ", ".join(sorted(remaining))
        raise SystemExit(
            "O build ainda enumera asset estável em uma configuração global "
            f"não reconhecida: {joined}."
        )

    if replacements:
        path.write_text(source.rstrip() + "\n", encoding="utf-8")
        compile(source, str(path), "exec")
        labels = ", ".join(sorted(changed_names)) or "constantes do build"
        print(f"Build corrigido por AST: assets estáveis removidos do pipeline de hash de {labels}.")
    else:
        print("Build já compatível com a sidebar canônica; nenhuma alteração necessária.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
