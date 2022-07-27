const path = require('path')
const { parseArgs } = require('util')
const writeJson = require('../lib/write-json.js')
const Api = require('../lib/api/rest.js')
const fetchData = require('../lib/project-data.js')
const logger = require('../lib/logger.js')
const getProjectsHistory = require('../lib/projects-history.js')
const pAll = require('../lib/p-all.js')

const getDate = (d) => ({
  month: (d.getUTCMonth() + 1).toString().padStart(2, '0'),
  year: d.getUTCFullYear().toString(),
  day: d.getUTCDate().toString().padStart(2, '0'),
  iso: d.toISOString(),
})

const getFilter = (rawFilter) => {
  if (!isNaN(rawFilter) && !isNaN(parseFloat(rawFilter))) {
    return (_, index) => index < +rawFilter
  }

  const names = rawFilter.split(',').map((name) => name.trim().toLowerCase())
  return (project) => {
    const name = project.pkg ?? project.name
    return names.includes(name.toLowerCase())
  }
}

const exec = async ({ auth, filter, projects: projectsFile }) => {
  if (!auth) {
    throw new Error(`AUTH_TOKEN is required`)
  }

  logger()

  // Make it easier to test by only fetching a subset of the projects
  const rawProjects = require(projectsFile)
  const projects = filter ? rawProjects.filter(getFilter(filter)) : rawProjects

  const api = Api({ auth })
  const { year, month, day, iso } = getDate(new Date())
  const dayId = `${year}-${month}-${day}`

  const dataDir = path.dirname(projectsFile)
  const dailyDir = path.join(dataDir, 'daily')

  const projectsHistory = await getProjectsHistory({
    projects,
    dir: dailyDir,
    filter: (f) => !f.endsWith('.min.json') && !f.startsWith(dayId),
  })

  const projectsData = await pAll(projects.map((project) => () => {
    return fetchData({
      api,
      project,
      history: projectsHistory[project.id],
    })
  }))

  const files = [
    path.join(dailyDir, `${dayId}.min.json`),
    { path: path.join(dailyDir, `${dayId}.json`), indent: 2 },
    path.join(dataDir, 'latest.min.json'),
    { path: path.join(dataDir, 'latest.json'), indent: 2 },
  ].filter(Boolean)

  const results = await writeJson(files, { data: projectsData, created_at: iso })
  return results.map((f) => f.message).join('\n')
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    filter: {
      type: 'string',
    },
    projects: {
      type: 'string',
    },
  },
})

exec({
  auth: process.env.AUTH_TOKEN,
  filter: values.filter,
  projects: values.projects ?? path.resolve(__dirname, '../../www/lib/data/maintained.json'),
})
  .then(console.log)
  .catch((err) => {
    process.exitCode = 1
    console.error(err)
  })