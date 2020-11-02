function type(val) {
  return Object.prototype.toString.call(val).slice(8, -1);
}

function isType(typeName, value) {
  const t = type(value)
  return t === typeName
}

function isValidStrategy(strategy){
  const s = [ 'minimum_idle_time', 'ranked']
  return s.includes(strategy)
}

function isNegative(num) {
  return num < 0
}

function validateNum(num) {
  return num && type(num) !== "Number" || isNegative(num)
}

function isWithinRange(num, min, max) {
  if (!num){
    return true
  }

  return num >= min && num <= max
}

module.exports = {
  type,
  isType,
  isValidStrategy,
  isNegative,
  validateNum,
  isWithinRange
}
