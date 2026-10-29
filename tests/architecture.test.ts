import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve('src');
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [join(directory, entry.name)]
        : [],
  );
}
describe('dependency boundaries', () => {
  it('keeps core and component implementations independent from transports and composition', () => {
    const violations: string[] = [];
    for (const file of files(root)) {
      const name = relative(root, file).replaceAll('\\', '/');
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const inspect = (node: ts.Node) => {
        const specifier = ts.isImportDeclaration(node)
          ? node.moduleSpecifier
          : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
            ? node.arguments[0]
            : undefined;
        if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) {
          const target = relative(root, resolve(file, '..', specifier.text)).replaceAll('\\', '/');
          if (
            /^(model|runtime|protocol|behavior)\//.test(name) &&
            /^(components|behaviors|composition|renderer|host|transports|integrations|contracts|skins|updates)\//.test(
              target,
            )
          )
            violations.push(`${name} → ${target}`);
          if (name.startsWith('components/')) {
            const component = name.split('/')[1];
            if (
              /^(host|transports|runtime|integrations|composition|renderer)\//.test(target) ||
              (target.startsWith('components/') && !target.startsWith(`components/${component}/`))
            )
              violations.push(`${name} → ${target}`);
          }
          if (/^(transports|integrations)\//.test(name) && /^runtime\/(?!ports)/.test(target))
            violations.push(`${name} → ${target}`);
          if (
            name.startsWith('transports/') &&
            /^(integrations|host|renderer|composition)\//.test(target)
          )
            violations.push(`${name} → ${target}`);
          if (
            name.startsWith('behaviors/') &&
            !target.startsWith('behavior/') &&
            !target.startsWith(`behaviors/${name.split('/')[1]}/`)
          )
            violations.push(`${name} → ${target}`);
          if (
            name.startsWith('contracts/') &&
            target.startsWith('integrations/') &&
            !(name === 'contracts/client.ts' && target === 'integrations/anelf/contracts')
          )
            violations.push(`${name} → ${target}`);
        }
        ts.forEachChild(node, inspect);
      };
      inspect(source);
    }
    expect(violations).toEqual([]);
  });
});
