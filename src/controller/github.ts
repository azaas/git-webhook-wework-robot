/**
 * github webhook handler
 * github 的webhook格式跟gitlab的不一样，天啊
 * 所以这里是需要重新开发的！注意！
 * @author LeoEatle
 */
import { BaseContext } from "koa";
import ChatRobot from "./chat";
import { config } from "../config";
import customLog from "../log";
const log = customLog("github handler");
import { Issues, Push, PullRequest, PullRequestReview } from "github-webhook-event-types";

const HEADER_KEY: string = "x-github-event";
// 陷入了沉思，为什么gitlab这里没有过去式，而github这里的action全加上了过去式
const actionWords = {
    "opened": "发起",
    "closed": "关闭",
    "reopened": "重新发起",
    "edited": "更新",
    "merge": "合并",
    "created": "创建",
    "requested": "请求",
    "completed": "完成",
    "synchronize": "同步更新",
    "submitted": "提交了审批结果",
    "dismissed": "审批未通过",
    "review_requested": "添加审批人",
    "review_request_removed": "移除审批人",
    "labeled": "审批请求添加标签",
    "unlabeled": "审批请求移除标签",
    "assigned": "分配给",
};

export default class GithubWebhookController {
    public static async getWebhook(ctx: BaseContext) {
        console.log("git webhook req", ctx.request);
        const event: string = ctx.request.header[HEADER_KEY];
        if (!event) {
            ctx.status = 403;
            ctx.body = `Sorry，这可能不是一个来自 Github 的webhook请求`;
            log.info(ctx.body);
            return;
        }
        const url = ctx.request.url;
        // 这一行必须要重置regex，不能放在全局！！参考：https://stackoverflow.com/questions/4724701/regexp-exec-returns-null-sporadically
        const ROBOTID_REGEX = /id=([a-zA-Z0-9-]+)/g;
        const robotidRe = ROBOTID_REGEX.exec(url);
        const robotid = robotidRe && robotidRe[1];
        robotid && console.log("robotid", robotid);
        switch (event) {
            case "push":
                return await GithubWebhookController.handlePush(ctx, robotid);
            case "pull_request":
                return await GithubWebhookController.handlePR(ctx, robotid);
            case "pull_request_review_comment":
            case "pull_request_review":
                return await GithubWebhookController.handlePRReview(ctx, robotid);
            case "ping":
                return await GithubWebhookController.handlePing(ctx, robotid);
            case "issues":
                return await GithubWebhookController.handleIssue(ctx, robotid);
            default:
                return await GithubWebhookController.handleDefault(ctx, event);
        }
    }

    /**
     * 处理ping事件
     * @param ctx koa context
     * @param robotid 机器人id
     */
    public static async handlePing(ctx: BaseContext, robotid?: string) {
        const robot: ChatRobot = new ChatRobot(
            config.chatid
        );
        const body: any = ctx.request.body;
        console.log(body);
        const { payload } = body;
        const { repository } = JSON.parse(payload);
        const msg = "成功收到了来自Github的Ping请求，项目名称：" + repository.name;
        await robot.sendTextMsg(msg);
        ctx.status = 200;
        return msg;
    }

    /**
     * 处理push事件
     * @param ctx koa context
     * @param robotid 机器人id
     */
    public static async handlePush(ctx: BaseContext, robotid?: string) {
        const body: Push = JSON.parse(ctx.request.body.payload);
        const robot: ChatRobot = new ChatRobot(
            config.chatid
        );
        let msg: String;
        log.info("push http body", body);
        const { pusher, repository, commits, ref } = body;
        const user_name = pusher.name;
        if (repository.name === "project_test" && user_name === "user_test") {
            msg = "收到一次webhook test";
            ctx.body = msg;
            return await robot.sendTextMsg(msg);
        } else {
            const lastCommit = commits[0];
            msg = `项目 ${repository.name} 收到了一次push，提交者：${user_name}，最新提交信息：${lastCommit.message}`;
            ctx.body = msg;
            const mdMsg = `项目 [${repository.name}](${repository.url}) 收到一次push提交
                           提交者:  \<font color= \"commit\"\>${user_name}\</font\>
                           分支:  \<font color= \"commit\"\>${ref}\</font\>
                           最新提交信息: ${lastCommit.message}`;
            await robot.sendMdMsg(mdMsg);
            ctx.status = 200;
            return;
        }
    }

    /**
     * 处理merge request事件
     * @param ctx koa context
     * @param robotid 机器人id
     */
    public static async handlePR(ctx: BaseContext, robotid?: string) {
        const body: PullRequest = JSON.parse(ctx.request.body.payload);
        const robot: ChatRobot = new ChatRobot(
            config.chatid
        );
        log.info("pr http body", body);
        const { action, sender, pull_request, repository } = body;
        let mdMsg = `${sender.login}在 [${repository.full_name}](${repository.html_url})`;
        switch (action) {
            case "assigned":
                const assigne = JSON.parse(ctx.request.body.payload).assignee;
                mdMsg += `把PR ${actionWords[action]} ${assigne.login} `;
                break;
            case "review_requested":
            case "review_request_removed":
                const reviewer = JSON.parse(ctx.request.body.payload).requested_reviewer;
                mdMsg += `${actionWords[action]}:${reviewer.login} `;
                break;
            case "unlabeled":
            case "labeled":
                //const label = JSON.parse(ctx.request.body.payload).label;
                //mdMsg += `${actionWords[action]}:${label.name} `;
                //break;
                return;
            case "submitted":
            case "edited":
                const review = JSON.parse(ctx.request.body.payload).review;
                switch (review.state) {
                    case "commented":
                        mdMsg += ` 提交了评论`;
                        break;
                    case "approved":
                    default:
                        mdMsg += ` 审批通过了PR`;
                        break;
                }
                break;
            case "closed":
                if (pull_request.merged) {
                    mdMsg += ` ${actionWords["merge"]}了PR`;
                }
                else {
                    mdMsg += ` ${actionWords[action]}了PR`;
                }
                break;
            default:
                mdMsg += ` ${actionWords[action]}了PR`;
                break;
        }
        mdMsg += `
                标题：${pull_request.title}
                源分支：${pull_request.head.ref}
                目标分支：${pull_request.base.ref}
                [查看PR详情](${pull_request.html_url})`;
        await robot.sendMdMsg(mdMsg);
        ctx.status = 200;
        return;
    }

    /**
     * 处理merge request review 事件
     * @param ctx koa context
     * @param robotid 机器人id
     */
    public static async handlePRReview(ctx: BaseContext, robotid?: string) {
        const body: PullRequestReview = JSON.parse(ctx.request.body.payload);
        const robot: ChatRobot = new ChatRobot(
            config.chatid
        );
        log.info("pr http body", body);
        const { action, review, pull_request, repository } = body;
        let mdMsg = `${review.user.login}在 [${repository.full_name}](${repository.html_url}) `;
        switch (review.state) {
            case "commented":
                mdMsg += `提交了评论`;
                break;
            default:
                mdMsg += `${actionWords[action]}了PR`;
                break;
        }
        mdMsg += `
        标题：${pull_request.title}
        源分支：${pull_request.head.ref}
        目标分支：${pull_request.base.ref}
        [查看PR详情](${pull_request.html_url})`;
        await robot.sendMdMsg(mdMsg);
        ctx.status = 200;
        return;
    }

    /**
     * 处理issue 事件
     * @param ctx koa context
     * @param robotid 机器人id
     */
    public static async handleIssue(ctx: BaseContext, robotid?: string) {
        const body: Issues = JSON.parse(ctx.request.body.payload);
        const robot: ChatRobot = new ChatRobot(
            config.chatid
        );
        log.info("issues", body);
        console.log(body);
        const { action, issue, repository } = body;
        if (action !== "opened") {
            ctx.body = `除非有人开启新的issue，否则无需通知机器人`;
            return;
        }
        const mdMsg = `有人在 [${repository.name}](${repository.html_url}) ${actionWords[action]}了一个issue
                        标题：${issue.title}
                        发起人：[${issue.user.login}](${issue.user.html_url})
                        [查看详情](${issue.html_url})`;
        await robot.sendMdMsg(mdMsg);
        ctx.status = 200;
        return;
    }

    /**
     * 对于未处理的事件，统一走这里
     * @param ctx koa context
     * @param event 事件名
     */
    public static handleDefault(ctx: BaseContext, event: String) {
        console.log(ctx.request.body);
        ctx.body = `Sorry，暂时还没有处理${event}事件`;
    }
}
