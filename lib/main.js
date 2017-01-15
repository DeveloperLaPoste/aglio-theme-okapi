const crypto = require('crypto')
const fs = require('fs')
const hljs = require('highlight.js')
const jade = require('jade')
const less = require('less')
const markdownIt = require('markdown-it')
const moment = require('moment')
const path = require('path')
const querystring = require('querystring')
const renderExample = require('./example')
const renderSchema = require('./schema')
const ROOT = path.dirname(__dirname)
let cache = {}

const benchmark = {
  start(message) {
    if (process.env.BENCHMARK) {
      return console.time(message)
    }
  },
  end(message) {
    if (process.env.BENCHMARK) {
      return console.timeEnd(message)
    }
  }
}

const errMsg = function(message, err) {
  err.message = message + ': ' + err.message
  return err
}

const sha1 = function(value) {
  return crypto.createHash('sha1').update(value.toString()).digest('hex')
}

const slug = function(cache, value, unique) {
  if (cache == null) {
    cache = {}
  }
  if (value == null) {
    value = ''
  }
  if (unique == null) {
    unique = false
  }
  let sluggified = value.toLowerCase().replace(/[ \t\n\\<>"'=:\/]/g, '-').replace(/-+/g, '-').replace(/^-/, '')
  if (unique) {
    while (cache[sluggified]) {
      if (sluggified.match(/\d+$/)) {
        sluggified = sluggified.replace(/\d+$/, function(value) {
          return parseInt(value) + 1
        })
      } else {
        sluggified = sluggified + '-1'
      }
    }
  }
  cache[sluggified] = true
  return sluggified
}

const highlight = function(code, lang, subset) {
  benchmark.start('highlight ' + lang)
  const response = (function() {
    switch (lang) {
      case 'no-highlight':
        return code
      case void 0:
      case null:
      case '':
        return hljs.highlightAuto(code, subset).value
      default:
        return hljs.highlight(lang, code).value
    }
  })()
  benchmark.end('highlight ' + lang)
  return response.trim()
}

const getCached = function(key, compiledPath, sources, load, done) {
  if (process.env.NOCACHE) {
    return done(null)
  }
  if (cache[key]) {
    return done(null, cache[key])
  }
  try {
    if (fs.existsSync(compiledPath)) {
      const compiledStats = fs.statSync(compiledPath)
      for (let i = 0, len = sources.length; i < len; i++) {
        const source = sources[i]
        const sourceStats = fs.statSync(source)
        if (sourceStats.mtime > compiledStats.mtime) {
          return done(null)
        }
      }
      try {
        return load(compiledPath, function(err, item) {
          if (err) {
            return done(errMsg('Error loading cached resource', err))
          }
          cache[key] = item
          return done(null, cache[key])
        })
      } catch (_error) {
        const loadErr = _error
        return done(errMsg('Error loading cached resource', loadErr))
      }
    } else {
      return done(null)
    }
  } catch (_error) {
    const err = _error
    return done(err)
  }
}

const getCss = function(variables, styles, verbose, done) {
  var customPath, i, item, j, len, len1, load, stylePaths
  const key = 'css-' + variables + '-' + styles
  if (cache[key]) {
    return done(null, cache[key])
  }
  const compiledPath = path.join(ROOT, 'cache', (sha1(key)) + '.css')
  const defaultVariablePath = path.join(ROOT, 'styles', 'variables-default.less')
  const sources = [defaultVariablePath]
  if (!Array.isArray(variables)) {
    variables = [variables]
  }
  if (!Array.isArray(styles)) {
    styles = [styles]
  }
  const variablePaths = [defaultVariablePath]
  for (i = 0, len = variables.length; i < len; i++) {
    const item = variables[i]
    if (item !== 'default') {
      let customPath = path.join(ROOT, 'styles', 'variables-' + item + '.less')
      if (!fs.existsSync(customPath)) {
        customPath = item
        if (!fs.existsSync(customPath)) {
          return done(new Error(customPath + ' does not exist!'))
        }
      }
      variablePaths.push(customPath)
      sources.push(customPath)
    }
  }
  stylePaths = []
  for (j = 0, len1 = styles.length; j < len1; j++) {
    item = styles[j]
    customPath = path.join(ROOT, 'styles', 'layout-' + item + '.less')
    if (!fs.existsSync(customPath)) {
      customPath = item
      if (!fs.existsSync(customPath)) {
        return done(new Error(customPath + ' does not exist!'))
      }
    }
    stylePaths.push(customPath)
    sources.push(customPath)
  }
  load = function(filename, loadDone) {
    return fs.readFile(filename, 'utf-8', loadDone)
  }
  if (verbose) {
    console.log('Using variables ' + variablePaths)
    console.log('Using styles ' + stylePaths)
    console.log('Checking cache ' + compiledPath)
  }
  return getCached(key, compiledPath, sources, load, function(err, css) {
    var k, l, len2, len3, tmp
    if (err) {
      return done(err)
    }
    if (css) {
      if (verbose) {
        console.log('Cached version loaded')
      }
      return done(null, css)
    }
    if (verbose) {
      console.log('Not cached or out of date. Generating CSS...')
    }
    tmp = ''
    for (k = 0, len2 = variablePaths.length; k < len2; k++) {
      customPath = variablePaths[k]
      tmp += '@import "' + customPath + '";\n'
    }
    for (l = 0, len3 = stylePaths.length; l < len3; l++) {
      customPath = stylePaths[l]
      tmp += '@import "' + customPath + '";\n'
    }
    benchmark.start('less-compile')
    return less.render(tmp, {
      compress: true
    }, function(err, result) {
      //var writeErr
      if (err) {
        return done(errMsg('Error processing LESS -> CSS', err))
      }
      try {
        css = result.css
        fs.writeFileSync(compiledPath, css, 'utf-8')
      } catch (_error) {
        const writeErr = _error
        return done(errMsg('Error writing cached CSS to file', writeErr))
      }
      benchmark.end('less-compile')
      cache[key] = css
      return done(null, cache[key])
    })
  })
}

const compileTemplate = function(filename, options) {
  return "var jade = require('jade/runtime');\n"
    + (jade.compileFileClient(filename, options))
    + '\nmodule.exports = compiledFunc;'
}

const getTemplate = function(name, verbose, done) {
  const builtin = path.join(ROOT, 'templates', name + '.jade')
  if (!fs.existsSync(name) && fs.existsSync(builtin)) {
    name = builtin
  }
  const key = 'template-' + name
  if (cache[key]) {
    return done(null, cache[key])
  }
  const compiledPath = path.join(ROOT, 'cache', (sha1(key)) + '.js')
  const load = function(filename, loadDone) {
    try {
      const loaded = require(filename)
      return loadDone(null, loaded)
    } catch (_error) {
      const loadErr = _error
      return loadDone(errMsg('Unable to load template', loadErr))
    }
  }
  if (verbose) {
    console.log('Using template ' + name)
    console.log('Checking cache ' + compiledPath)
  }
  return getCached(key, compiledPath, [name], load, function(err, template) {
    if (err) {
      return done(err)
    }
    if (template) {
      if (verbose) {
        console.log('Cached version loaded')
      }
      return done(null, template)
    }
    if (verbose) {
      console.log('Not cached or out of date. Generating template JS...')
    }
    benchmark.start('jade-compile')
    const compileOptions = {
      filename: name,
      name: 'compiledFunc',
      self: true,
      compileDebug: false
    }
    let compiled
    try {
      compiled = compileTemplate(name, compileOptions)
    } catch (_error) {
      const compileErr = _error
      return done(errMsg('Error compiling template', compileErr))
    }
    if (compiled.indexOf('self.') === -1) {
      compileOptions.self = false
      try {
        compiled = compileTemplate(name, compileOptions)
      } catch (_error) {
        const compileErr = _error
        return done(errMsg('Error compiling template', compileErr))
      }
    }
    try {
      fs.writeFileSync(compiledPath, compiled, 'utf-8')
    } catch (_error) {
      const writeErr = _error
      return done(errMsg('Error writing cached template file', writeErr))
    }
    benchmark.end('jade-compile')
    cache[key] = require(compiledPath)
    return done(null, cache[key])
  })
}

const modifyUriTemplate = function(templateUri, parameters, colorize) {
  var index, param, parameterSet
  const parameterValidator = function(b) {
    return parameterNames.indexOf(querystring.unescape(b.replace(/^\*|\*$/, ''))) !== -1
  }
  const parameterNames = (function() {
    const results = []
    for (let i = 0, len = parameters.length; i < len; i++) {
      param = parameters[i]
      results.push(param.name)
    }
    return results
  })()
  const parameterBlocks = []
  let lastIndex = index = 0
  while ((index = templateUri.indexOf('{', index)) !== -1) {
    parameterBlocks.push(templateUri.substring(lastIndex, index))
    const block = {}
    const closeIndex = templateUri.indexOf('}', index)
    block.querySet = templateUri.indexOf('{?', index) === index
    block.formSet = templateUri.indexOf('{&', index) === index
    block.reservedSet = templateUri.indexOf('{+', index) === index
    lastIndex = closeIndex + 1
    index++
    if (block.querySet || block.formSet || block.reservedSet) {
      index++
    }
    parameterSet = templateUri.substring(index, closeIndex)
    block.parameters = parameterSet.split(',').filter(parameterValidator)
    if (block.parameters.length) {
      parameterBlocks.push(block)
    }
  }
  parameterBlocks.push(templateUri.substring(lastIndex, templateUri.length))
  return parameterBlocks.reduce(function(uri, v) {
    if (typeof v === 'string') {
      uri.push(v)
    } else {
      const segment = !colorize ? ['{'] : []
      if (v.querySet) {
        segment.push('?')
      }
      if (v.formSet) {
        segment.push('&')
      }
      if (v.reservedSet && !colorize) {
        segment.push('+')
      }
      segment.push(v.parameters.map(function(name) {
        if (!colorize) {
          return name
        } else {
          name = name.replace(/^\*|\*$/, '')
          param = parameters[parameterNames.indexOf(querystring.unescape(name))]
          if (v.querySet || v.formSet) {
            return ('<span class="hljs-attribute">' + name + '=</span>')
              + ('<span class="hljs-literal">' + (param.example || '')
              + '</span>')
          } else {
            return '<span class="hljs-attribute" title="' + name + '">' + (param.example || name) + '</span>'
          }
        }
      }).join(colorize ? '&' : ','))
      if (!colorize) {
        segment.push('}')
      }
      uri.push(segment.join(''))
    }
    return uri
  }, []).join('').replace(/\/+/g, '/')
}

const decorate = function(api, md, slugCache, verbose) {
  const slugify = slug.bind(slug, slugCache)
  const dataStructures = {}
  const ref = api.content || []
  for (let i = 0, len = ref.length; i < len; i++) {
    const category = ref[i]
    const ref1 = category.content || []
    for (let j = 0, len1 = ref1.length; j < len1; j++) {
      const item = ref1[j]
      if (item.element === 'dataStructure') {
        const dataStructure = item.content[0]
        dataStructures[dataStructure.meta.id] = dataStructure
      }
    }
  }
  if (verbose) {
    console.log('Known data structures: ' + (Object.keys(dataStructures)))
  }
  if (api.description) {
    api.descriptionHtml = md.render(api.description)
    api.navItems = slugCache._nav
    slugCache._nav = []
  }
  const ref2 = api.metadata || []
  for (let k = 0, len2 = ref2.length; k < len2; k++) {
    const meta = ref2[k]
    if (meta.name === 'HOST') {
      api.host = meta.value
    }
  }
  const ref3 = api.resourceGroups || []
  const results = []
  for (let l = 0, len3 = ref3.length; l < len3; l++) {
    const resourceGroup = ref3[l]
    resourceGroup.elementId = slugify(resourceGroup.name, true)
    resourceGroup.elementLink = '#' + resourceGroup.elementId
    if (resourceGroup.description) {
      resourceGroup.descriptionHtml = md.render(resourceGroup.description)
      resourceGroup.navItems = slugCache._nav
      slugCache._nav = []
    }
    results.push((function() {
      var len4, m, ref4, results1
      ref4 = resourceGroup.resources || []
      results1 = []
      for (m = 0, len4 = ref4.length; m < len4; m++) {
        const resource = ref4[m]
        resource.elementId = slugify(resourceGroup.name + '-' + resource.name, true)
        resource.elementLink = '#' + resource.elementId
        results1.push((function() {
          //var len5, len6, n, o, ref5, results2
          const ref5 = resource.actions || []
          const results2 = []
          for (let n = 0, len5 = ref5.length; n < len5; n++) {
            const action = ref5[n]
            action.elementId = slugify(resourceGroup.name + '-' + resource.name + '-' + action.method, true)
            action.elementLink = '#' + action.elementId
            action.methodLower = action.method.toLowerCase()
            if (!(action.attributes || {}).uriTemplate) {
              if (!action.parameters || !action.parameters.length) {
                action.parameters = resource.parameters
              } else if (resource.parameters) {
                action.parameters = resource.parameters.concat(action.parameters)
              }
            }
            const knownParams = {}
            const newParams = []
            const reversed = (action.parameters || []).concat([]).reverse()
            for (let o = 0, len6 = reversed.length; o < len6; o++) {
              const param = reversed[o]
              if (knownParams[param.name]) {
                continue
              }
              knownParams[param.name] = true
              newParams.push(param)
            }
            action.parameters = newParams.reverse()
            action.uriTemplate = modifyUriTemplate(
              (action.attributes || {}).uriTemplate || resource.uriTemplate || '',
              action.parameters
            )
            action.colorizedUriTemplate = modifyUriTemplate(
              (action.attributes || {}).uriTemplate || resource.uriTemplate || '',
              action.parameters,
              true
            )
            action.hasRequest = false
            results2.push((function() {
              //var len7, p, ref6, results3
              const ref6 = action.examples || []
              const results3 = []
              for (let p = 0, len7 = ref6.length; p < len7; p++) {
                const example = ref6[p]
                results3.push((function() {
                  //var len8, q, ref7, results4
                  const ref7 = ['requests', 'responses']
                  const results4 = []
                  for (let q = 0, len8 = ref7.length; q < len8; q++) {
                    const name = ref7[q]
                    results4.push((function() {
                      var len10, len11, len9, r, ref10, ref8, ref9, results5, s, t
                      ref8 = example[name] || []
                      results5 = []
                      for (r = 0, len9 = ref8.length; r < len9; r++) {
                        const item = ref8[r]
                        if (name === 'requests' && !action.hasRequest) {
                          action.hasRequest = true
                        }
                        if (!item.schema && item.content) {
                          ref9 = item.content
                          for (s = 0, len10 = ref9.length; s < len10; s++) {
                            const dataStructure = ref9[s]
                            if (dataStructure.element === 'dataStructure') {
                              try {
                                const schema = renderSchema(dataStructure.content[0], dataStructures)
                                schema['$schema'] = 'http://json-schema.org/draft-04/schema#'
                                item.schema = JSON.stringify(schema, null, 2)
                              } catch (_error) {
                                const err = _error
                                if (verbose) {
                                  console.log(JSON.stringify(dataStructure.content[0], null, 2))
                                  console.log(err)
                                }
                              }
                            }
                          }
                        }
                        if (item.content && !process.env.DRAFTER_EXAMPLES) {
                          ref10 = item.content
                          for (t = 0, len11 = ref10.length; t < len11; t++) {
                            const dataStructure = ref10[t]
                            if (dataStructure.element === 'dataStructure') {
                              try {
                                item.body = JSON.stringify(
                                  renderExample(dataStructure.content[0], dataStructures),
                                  null,
                                  2
                                )
                              } catch (_error) {
                                const err = _error
                                if (verbose) {
                                  console.log(JSON.stringify(dataStructure.content[0], null, 2))
                                  console.log(err)
                                }
                              }
                            }
                          }
                        }
                        item.hasContent = item.description
                          || Object.keys(item.headers).length
                          || item.body
                          || item.schema
                        try {
                          if (item.body) {
                            item.body = JSON.stringify(JSON.parse(item.body), null, 2)
                          }
                          if (item.schema) {
                            results5.push(item.schema = JSON.stringify(JSON.parse(item.schema), null, 2))
                          } else {
                            results5.push(void 0)
                          }
                        } catch (_error) {
                          results5.push(false)
                        }
                      }
                      return results5
                    })())
                  }
                  return results4
                })())
              }
              return results3
            })())
          }
          return results2
        })())
      }
      return results1
    })())
  }
  return results
}

exports.getConfig = function() {
  return {
    formats: ['1A'],
    options: [
      {
        name: 'variables',
        description: 'Color scheme name or path to custom variables',
        'default': 'default'
      }, {
        name: 'condense-nav',
        description: 'Condense navigation links',
        boolean: true,
        'default': true
      }, {
        name: 'full-width',
        description: 'Use full window width',
        boolean: true,
        'default': false
      }, {
        name: 'template',
        description: 'Template name or path to custom template',
        'default': 'default'
      }, {
        name: 'style',
        description: 'Layout style name or path to custom stylesheet'
      }, {
        name: 'emoji',
        description: 'Enable support for emoticons',
        boolean: true,
        'default': true
      }
    ]
  }
}

exports.render = function(input, options, done) {
  var md, slugCache, themeStyle, themeVariables, verbose
  if (done == null) {
    done = options
    options = {}
  }
  if (process.env.NOCACHE) {
    cache = {}
  }
  if (options.condenseNav) {
    options.themeCondenseNav = options.condenseNav
  }
  if (options.fullWidth) {
    options.themeFullWidth = options.fullWidth
  }
  if (options.themeVariables == null) {
    options.themeVariables = 'default'
  }
  if (options.themeStyle == null) {
    options.themeStyle = 'default'
  }
  if (options.themeTemplate == null) {
    options.themeTemplate = 'default'
  }
  if (options.themeCondenseNav == null) {
    options.themeCondenseNav = true
  }
  if (options.themeFullWidth == null) {
    options.themeFullWidth = false
  }
  if (options.themeTemplate === 'default') {
    options.themeTemplate = path.join(ROOT, 'templates', 'index.jade')
  }
  slugCache = {
    _nav: []
  }
  md = markdownIt(
    {
      html: true,
      linkify: true,
      typographer: true,
      highlight: highlight
    })
    .use(require('markdown-it-checkbox'))
    .use(require('markdown-it-container'), 'note')
    .use(require('markdown-it-container'), 'warning')
  if (options.themeEmoji) {
    md.use(require('markdown-it-emoji'))
  }
  md.renderer.rules.code_block = md.renderer.rules.fence
  benchmark.start('decorate')
  decorate(input, md, slugCache, options.verbose)
  benchmark.end('decorate')
  benchmark.start('css-total')
  themeVariables = options.themeVariables, themeStyle = options.themeStyle, verbose = options.verbose
  return getCss(themeVariables, themeStyle, verbose, function(err, css) {
    var key, locals, ref, value
    if (err) {
      return done(errMsg('Could not get CSS', err))
    }
    benchmark.end('css-total')
    locals = {
      api: input,
      condenseNav: options.themeCondenseNav,
      css,
      fullWidth: options.themeFullWidth,
      date: moment,
      hash: function(value) {
        return crypto.createHash('md5').update(value.toString()).digest('hex')
      },
      highlight,
      markdown: function(content) {
        return md.render(content)
      },
      slug: slug.bind(slug, slugCache),
      urldec: function(value) {
        return querystring.unescape(value)
      }
    }
    ref = options.locals || {}
    for (key in ref) {
      value = ref[key]
      locals[key] = value
    }
    benchmark.start('get-template')
    return getTemplate(options.themeTemplate, verbose, function(getTemplateErr, renderer) {
      var html
      if (getTemplateErr) {
        return done(errMsg('Could not get template', getTemplateErr))
      }
      benchmark.end('get-template')
      benchmark.start('call-template')
      try {
        html = renderer(locals)
      } catch (_error) {
        err = _error
        return done(errMsg('Error calling template during rendering', err))
      }
      benchmark.end('call-template')
      return done(null, html)
    })
  })
}
