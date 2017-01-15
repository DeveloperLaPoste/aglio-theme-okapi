const deepEqual = require('assert').deepEqual
const inherit = require('./inherit')
const renderSchema = function(root, dataStructures) {
  let schema = {}
  switch (root.element) {
    case 'boolean':
    case 'string':
    case 'number':
      schema.type = root.element
      const ref1 = root.attributes
      if ((ref1 != null ? ref1['default'] : void 0) != null) {
        schema['default'] = root.attributes['default']
      }
      break
    case 'enum':
      schema['enum'] = []
      const ref2 = root.content || []
      for (let j = 0, len = ref2.length; j < len; j++) {
        const item = ref2[j]
        schema['enum'].push(item.content)
      }
      break
    case 'array':
      schema.type = 'array'
      const items = []
      const ref3 = root.content || []
      for (let k = 0, len1 = ref3.length; k < len1; k++) {
        const item = ref3[k]
        items.push(renderSchema(item, dataStructures))
      }
      if (items.length === 1) {
        schema.items = items[0]
      } else if (items.length > 1) {
        try {
          schema.items = items.reduce(function(l, r) {
            return deepEqual(l, r) || r
          })
        } catch (_error) {
          schema.items = {
            'anyOf': items
          }
        }
      }
      break
    case 'object':
    case 'option':
      schema.type = 'object'
      schema.properties = {}
      const required = []
      const properties = root.content.slice(0)
      let i = 0
      while (i < properties.length) {
        const member = properties[i]
        i++
        if (member.element === 'ref') {
          const ref = dataStructures[member.content.href]
          i--
          properties.splice.apply(properties, [i, 1].concat(ref.content))
          continue
        } else if (member.element === 'select') {
          const exclusive = []
          const ref4 = member.content
          for (let m = 0, len2 = ref4.length; m < len2; m++) {
            const option = ref4[m]
            const optionSchema = renderSchema(option, dataStructures)
            const ref5 = optionSchema.properties
            for (let key in ref5) {
              const prop = ref5[key]
              exclusive.push(key)
              schema.properties[key] = prop
            }
          }
          if (!schema.allOf) {
            schema.allOf = []
          }
          schema.allOf.push({
            not: {
              required: exclusive
            }
          })
          continue
        }
        const key = member.content.key.content
        schema.properties[key] = renderSchema(member.content.value, dataStructures)
        const ref6 = member.meta
        if ((ref6 != null ? ref6.description : void 0) != null) {
          schema.properties[key].description = member.meta.description
        }
        const ref7 = member.attributes
        if (ref7 != null ? ref7.typeAttributes : void 0) {
          const typeAttr = member.attributes.typeAttributes
          if (typeAttr.indexOf('required') !== -1) {
            if (required.indexOf(key) === -1) {
              required.push(key)
            }
          }
          if (typeAttr.indexOf('nullable') !== -1) {
            schema.properties[key].type = [schema.properties[key].type, 'null']
          }
        }
      }
      if (required.length) {
        schema.required = required
      }
      break
    default:
      const ref = dataStructures[root.element]
      if (ref) {
        schema = renderSchema(inherit(ref, root), dataStructures)
      }
  }
  const ref8 = root.meta
  if ((ref8 != null ? ref8.description : void 0) != null) {
    schema.description = root.meta.description
  }
  const ref9 = root.attributes
  if (ref9 != null ? ref9.typeAttributes : void 0) {
    const typeAttr = root.attributes.typeAttributes
    if (typeAttr.indexOf('nullable') !== -1) {
      schema.type = [schema.type, 'null']
    }
  }
  return schema
}

module.exports = renderSchema
