export function makeSassTokenInjection(): string {
  return (
    `
@use "sass:string";

@function _sd_to_css_var_name($path) {
  $out: "";
  @for $i from 1 through string.length($path) {
    $ch: string.slice($path, $i, $i);
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

export function mergeScssAdditionalData(
  existing: unknown,
  injection: string
): string | ((source: string, filename: string) => string) {
  if (typeof existing === 'function') {
    return (source: string, filename: string) =>
      injection + existing(source, filename);
  }
  if (typeof existing === 'string') return injection + existing;
  return injection;
}
