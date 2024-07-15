import * as acorn from 'acorn'
import { helmTemplate } from './helmTemplate.js'
// This is some comment
import './getRequires.js'

const huh = helmTemplate({
  repo: 'https://charts.external-secrets.io',
  name: 'testrelease',
  chart: 'external-secrets',
})

const parser = acorn.parse('const wo = "fuh";', {
    ecmaVersion: 'latest'
})

console.log(huh.buffer.toString())
