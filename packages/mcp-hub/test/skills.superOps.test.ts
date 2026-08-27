import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const skillRoot = resolve(__dirname, '../../../skills/super-ops');

function readSkill(rel: string): string {
  return readFileSync(join(skillRoot, rel), 'utf8');
}

function yamlFrontmatter(text: string): string {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error('missing YAML frontmatter');
  }
  return match[1];
}

const OPS_REFS = [
  'linux-host.md',
  'systemd-services.md',
  'network-dns-tls.md',
  'storage-filesystem.md',
  'docker-compose.md',
  'kubernetes.md',
  'web-proxy.md',
  'databases.md',
  'observability.md',
  'deployment-rollbacks.md',
  'backup-disaster-recovery.md',
  'security-incidents.md',
  'incident-response.md',
  'workspace-troubleshooting.md',
  'safe-operations.md'
];

describe('SuperOps skill contract', () => {
  it('keeps description as triggers only — no Hub workflow shortcut', () => {
    const frontmatter = yamlFrontmatter(readSkill('SKILL.md'));
    expect(frontmatter).toMatch(/Use when/i);
    expect(frontmatter).toMatch(/堡垒机|JumpServer/);
    expect(frontmatter).toMatch(/Nacos|配置中心/);
    expect(frontmatter).toMatch(/at_\*|meta-tools/);
    expect(frontmatter).not.toMatch(/discover\s*→\s*select/i);
    expect(frontmatter).not.toMatch(/first-class call/i);
  });

  it('states when not to use, red flags, and a compose pointer', () => {
    const skill = readSkill('SKILL.md');
    expect(skill).toMatch(/When not to use/i);
    expect(skill).toMatch(/Red flags/i);
    expect(skill).toContain('compose-knowledge.md');
    expect(skill).toContain('grafana_query_prometheus');
    expect(skill).not.toContain('Load every reference that applies');
  });

  it('documents typed Grafana queries and JumpServer Redis; drops removed MySQL tools', () => {
    const grafana = readSkill('references/grafana.md');
    expect(grafana).toContain('grafana_query_prometheus');
    expect(grafana).toContain('grafana_query_loki');
    expect(grafana).toContain('grafana_query_datasource');

    const jumpserver = readSkill('references/jumpserver.md');
    expect(jumpserver).toContain('jumpserver_redis_execute_command');
    expect(jumpserver).not.toContain('jumpserver_mysql_get_context');
    expect(jumpserver).not.toContain('jumpserver_mysql_send_input');
  });

  it('routes Nacos as a fourth provider with the plugin-instance vs service-host split', () => {
    const skill = readSkill('SKILL.md');
    expect(skill).toContain('at.nacos');
    expect(skill).toContain('references/nacos.md');

    const nacos = readSkill('references/nacos.md');
    expect(nacos).toContain('nacos_list_instances');
    expect(nacos).toContain('nacos_list_service_instances');
    expect(nacos).toContain('nacos_get_config');
    expect(nacos).toMatch(/Allow Agent background access/);
    expect(nacos).toMatch(/empty string|public/);
    expect(nacos).toMatch(/raw:\s*true/);
    expect(nacos.split(/\n/).length).toBeLessThan(90);
  });

  it('ships compose-knowledge.md as a pointer, not an encyclopedia', () => {
    expect(existsSync(join(skillRoot, 'references/compose-knowledge.md'))).toBe(true);
    const compose = readSkill('references/compose-knowledge.md');
    expect(compose).toContain('grafana/skills');
    expect(compose.split(/\s+/).length).toBeLessThan(400);
  });

  it('gives each ops reference Related + Common mistakes without bloating files', () => {
    for (const name of OPS_REFS) {
      const text = readSkill(`references/${name}`);
      expect(text, name).toMatch(/## Related/i);
      expect(text, name).toMatch(/## Common mistakes/i);
      expect(text.split(/\n/).length, name).toBeLessThan(80);
    }
  });

  it('does not add cookbook YAML or BagelHole-style scripts/', () => {
    expect(existsSync(join(skillRoot, 'scripts'))).toBe(false);
    const skill = readSkill('SKILL.md');
    expect(skill).not.toMatch(/apiVersion:\s*apps\/v1/);
    const extraMd = readdirSync(join(skillRoot, 'references')).filter(
      (name) => extname(name) === '.md' && name.endsWith('.md')
    );
    expect(extraMd).toContain('compose-knowledge.md');
  });
});
