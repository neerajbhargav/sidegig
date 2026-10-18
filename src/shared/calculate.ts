/** A small arithmetic parser. Expressions never run as JavaScript. */
export function calculate(expression: string): number {
  const text = expression.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s/g, '');
  if (!text || text.length > 200) throw new Error('Enter a calculation.');
  const tokens = text.match(/(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?|[()+\-*/%]/gi) ?? [];
  if (tokens.join('') !== text) throw new Error('Use numbers, parentheses and arithmetic operators.');
  let at = 0;
  const atom = (): number => {
    const token = tokens[at++];
    if (token === '+') return atom();
    if (token === '-') return -atom();
    if (token === '(') {
      const value = sum();
      if (tokens[at++] !== ')') throw new Error('Close the parenthesis.');
      return value;
    }
    if (!token || !/^\d|^\./.test(token)) throw new Error('Finish the calculation.');
    return Number(token);
  };
  const product = (): number => {
    let value = atom();
    while (['*', '/', '%'].includes(tokens[at])) {
      const op = tokens[at++], right = atom();
      if ((op === '/' || op === '%') && right === 0) throw new Error('Cannot divide by zero.');
      value = op === '*' ? value * right : op === '/' ? value / right : value % right;
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (tokens[at] === '+' || tokens[at] === '-') {
      const op = tokens[at++], right = product();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  };
  const result = sum();
  if (at !== tokens.length) throw new Error('Check the calculation.');
  if (!Number.isFinite(result)) throw new Error('The result is too large.');
  return Number(result.toPrecision(12));
}
