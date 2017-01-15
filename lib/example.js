const inherit = require('./inherit')

const defaultValue = function(type) {
  switch (type) {
    case 'boolean':
      return true
    case 'number':
      return 1
    case 'string':
      return 'Hello, world!'
  }
}

const renderExample = function(root, dataStructures) {
  switch (root.element) {
    case 'boolean':
    case 'string':
    case 'number':
      if (root.content != null) {
        return root.content
      }
      return defaultValue(root.element)
    case 'enum':
      return renderExample(root.content[0], dataStructures)
    case 'array':
      const ref1 = root.content || []
      const results = []
      for (let j = 0, len = ref1.length; j < len; j++) {
        const item = ref1[j]
        results.push(renderExample(item, dataStructures))
      }
      return results
    case 'object':
      const obj = {}
      const properties = root.content.slice(0)
      let member
      let i = 0
      while (i < properties.length) {
        member = properties[i]
        i++
        if (member.element === 'ref') {
          const ref = dataStructures[member.content.href]
          i--
          properties.splice.apply(properties, [i, 1].concat(ref.content))
          continue
        } else if (member.element === 'select') {
          member = member.content[0].content[0]
        }
        const key = member.content.key.content
        obj[key] = renderExample(member.content.value, dataStructures)
      }
      return obj
    default:
      const ref = dataStructures[root.element]
      if (ref) {
        return renderExample(inherit(ref, root), dataStructures)
      }
  }
}

module.exports = renderExample
