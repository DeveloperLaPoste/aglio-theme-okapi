const hasProp = {}.hasOwnProperty

const uniqueMembers = function(content) {
  const known = []
  let i = content.length - 1
  const results = []
  while (i >= 0) {
    if (content[i].element === 'member') {
      const key = content[i].content.key.content
      if (known.indexOf(key) !== -1) {
        content.splice(i, 1)
        continue
      }
      known.push(key)
    }
    results.push(i--)
  }
  return results
}

module.exports = function(base, element) {
  const combined = JSON.parse(JSON.stringify(base))
  if (element.meta) {
    if (combined.meta == null) {
      combined.meta = {}
    }
    const ref = element.meta
    for (const key in ref) {
      if (!hasProp.call(ref, key)) continue
      const value = ref[key]
      combined.meta[key] = value
    }
  }
  if (element.attributes) {
    if (combined.attributes == null) {
      combined.attributes = {}
    }
    const ref1 = element.attributes
    for (let key in ref1) {
      if (!hasProp.call(ref1, key)) continue
      const value = ref1[key]
      combined.attributes[key] = value
    }
  }
  if (element.content) {
    const ref2 = combined.content
    const ref3 = element.content
    if ((ref2 !== null ? ref2.push : void 0) || (ref3 !== null ? ref3.push : void 0)) {
      if (combined.content == null) {
        combined.content = []
      }
      const ref4 = element.content
      for (let j = 0, len = ref4.length; j < len; j++) {
        const item = ref4[j]
        combined.content.push(item)
      }
      if (combined.content.length && combined.content[0].element === 'member') {
        uniqueMembers(combined.content)
      }
    } else {
      combined.content = element.content
    }
  }
  return combined
}
