import { normalizeCssVarPrefix } from './cssVar';

export function makeSassTokenInjection(cssVarPrefix?: string): string {
  const prefix = normalizeCssVarPrefix(cssVarPrefix);
  const prefixLiteral = prefix ? `${JSON.stringify(`${prefix}-`)}` : '""';

  return (
    `
@use "sass:string" as _themeShiftString;

@function _sd_to_css_var_name($path) {
  $out: ${prefixLiteral};
  @for $i from 1 through _themeShiftString.length($path) {
    $ch: _themeShiftString.slice($path, $i, $i);
    @if $ch == "." { $out: $out + "-"; }
    @else { $out: $out + $ch; }
  }
  @return "--" + $out;
}

@function token($path) {
  @return var(#{_sd_to_css_var_name($path)});
}
`.trim() + '\n'
  );
}

function splitLeadingScssDirectives(source: string) {
  const directivePattern =
    /^(?<prefix>(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*)(?<directive>@(?:charset|use|forward)\b[\s\S]*?;)/;
  let remaining = source;
  let leading = '';

  while (true) {
    const match = remaining.match(directivePattern);
    if (!match?.groups) break;

    leading += match.groups.prefix + match.groups.directive;
    remaining = remaining.slice(match[0].length);
  }

  return { leading, remaining };
}

function mergeScssStrings(existing: string, injection: string) {
  const existingParts = splitLeadingScssDirectives(existing);
  const injectionParts = splitLeadingScssDirectives(injection);

  const leading = [existingParts.leading, injectionParts.leading]
    .filter(Boolean)
    .map((part) => part.trimEnd())
    .join('\n');

  return (
    leading +
    (leading ? '\n' : '') +
    injectionParts.remaining +
    existingParts.remaining
  );
}

export function mergeScssAdditionalData(
  existing: unknown,
  injection: string
) {
  const applyExisting = (source: string, filename: string) => {
    if (typeof existing === 'function') {
      return existing(source, filename);
    }

    if (typeof existing === 'string') {
      return existing + source;
    }

    return source;
  };

  return (source: string, filename: string) =>
    mergeScssStrings(applyExisting(source, filename), injection);
}
