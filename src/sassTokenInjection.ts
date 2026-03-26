import { normalizeCssVarPrefix } from './cssVar';

function makeSassTokenHelpers(options: {
  bakedPrefix?: string;
  prefixVariableName?: string;
}) {
  const { bakedPrefix, prefixVariableName } = options;
  const prefix = normalizeCssVarPrefix(bakedPrefix);
  const prefixSource = prefixVariableName
    ? `$prefix: if(${prefixVariableName} == null or ${prefixVariableName} == "", "", ${prefixVariableName} + "-");`
    : `$prefix: ${prefix ? JSON.stringify(`${prefix}-`) : '""'};`;

  return (
    `
@use "sass:string" as _themeShiftString;

${prefixVariableName ? `$${prefixVariableName.replace(/^\$/, '')}: null !default;\n` : ''}${
      prefixSource
    }

@function _sd_is_uppercase($ch) {
  @return $ch != _themeShiftString.to-lower-case($ch) and $ch == _themeShiftString.to-upper-case($ch);
}

@function _sd_to_css_var_name($path) {
  $out: $prefix;
  @for $i from 1 through _themeShiftString.length($path) {
    $ch: _themeShiftString.slice($path, $i, $i);
    @if $ch == "." {
      $out: $out + "-";
    } @else if $ch == "_" {
      $out: $out + "-";
    } @else if _sd_is_uppercase($ch) {
      @if $i > 1 {
        $prev: _themeShiftString.slice($path, $i - 1, $i - 1);
        @if $prev != "." and $prev != "_" and $prev != "-" {
          $out: $out + "-";
        }
      }
      $out: $out + _themeShiftString.to-lower-case($ch);
    } @else {
      $out: $out + $ch;
    }
  }
  @return "--" + $out;
}

@function token($path) {
  @return var(#{_sd_to_css_var_name($path)});
}
`.trim() + '\n'
  );
}

export function makeSassTokenInjection(cssVarPrefix?: string): string {
  return makeSassTokenHelpers({ bakedPrefix: cssVarPrefix });
}

export function makeStandaloneSassTokenModule(): string {
  return makeSassTokenHelpers({ prefixVariableName: '$var-prefix' });
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
