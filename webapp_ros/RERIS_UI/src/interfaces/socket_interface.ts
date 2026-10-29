// export type payloadAction = 'goal_cmd' | 'goal_multi_cmd' 
export enum payloadAction {
    vel_cmd,
    goal_cmd,
    goal_multi_cmd,
    heartbeat_cmd,
    exec_multi_cmd,
    record_cmd,
    select_map_cmd,
}

