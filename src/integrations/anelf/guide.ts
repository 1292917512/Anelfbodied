import { mcpConfiguration, type LocalControlConnection } from '../../shared/mcp-configuration';

export const defaultSkillName = 'anelfbodied-control';
const skillSource =
  'https://github.com/1292917512/Anelfbodied/tree/main/skills/anelfbodied-control';
const skillEntry =
  'https://raw.githubusercontent.com/1292917512/Anelfbodied/main/skills/anelfbodied-control/SKILL.md';

/** Builds an explicit setup request with the running instance's MCP configuration. */
export function channelGuide(skillName: string, local: LocalControlConnection): string {
  return `请帮我完成 AnelfBodied 桌宠的频道接入，当前选择的技能名称是 ${skillName}。

先用 get_skill 检查该技能。${
    skillName === defaultSkillName
      ? `缺失时，请读取官方入口 ${skillEntry}，用现有技能或文件工具安装完整技能目录（包括 references 和 agents），来源：${skillSource}。已有技能请保留，不重复安装或覆盖。`
      : '这是自定义技能名称；若缺失，请说明需要对应技能的来源，不要用其他技能冒充或覆盖它。'
  }

这是当前桌宠实例的 MCP 客户端配置，包含真实地址、端口和控制凭据。Anelf 服务端使用 transport="streamable_http"、url 和 headers，请按实际 MCP 管理工具的参数配置；不要直接覆盖整份 MCP 配置文件，不要在回复中复述 Token：
${JSON.stringify(mcpConfiguration(local), null, 2)}

该服务仅监听桌宠所在电脑的回环地址。如果你运行在另一台电脑或远端服务器上，这个地址不可直连；请说明需要用户提供可达的受认证代理或隧道，不要将它误当成你所在服务器的本机服务。

这是频道接入，需要通过工具关联 Skill 和 MCP：先用 list_mcp_servers 检查对应服务，确认已存在的配置是否匹配本实例；缺失时用实际 MCP 管理工具添加，避免重复创建或覆盖同名的其他服务。然后用 set_skill_mcp_servers(name="${skillName}", server_names=[实际服务名]) 绑定，保留该技能其他已有的关联。无法确定目标或缺少权限时，请说明缺少什么。

关联不等于已连接或已激活。按需要用 connect_mcp_server 和 activate_tool_group(group="mcp:实际服务名") 准备工具，再调用 pet_capabilities 验证接入。动作通过 MCP 工具执行，执行回执及 ask 的真实回答由工具结果返回；频道正文只回复话语，不发送动作 JSON，也不重复回传回执。skills 字段会由 Anelf 转成内部技能标签，不需要在正文再拼接标签。

请用普通话语说明实际安装、绑定和连接结果；不要把收到本消息当作配置成功。`;
}
