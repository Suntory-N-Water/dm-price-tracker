create table executes (
  id text primary key,
  status text not null default 'WAITING',
  started_at text,
  created_at text not null default (CURRENT_TIMESTAMP),
  updated_at text not null default (CURRENT_TIMESTAMP),
  constraint executes_status_check check (
    status in ('WAITING', 'RUNNING', 'FINISHED', 'ABORTED')
  )
);

create index executes_status_idx on executes (status);

create table jobs (
  id text primary key,
  execute_id text not null references executes (id)
    on delete cascade
    on update cascade,
  parent_job_id text references jobs (id)
    on delete cascade
    on update cascade,
  kind text not null,
  status text not null default 'WAITING',
  url text not null,
  meta text not null default '{}',
  result_count integer not null default 0,
  result_error text,
  started_at text,
  crawled_at text,
  created_at text not null default (CURRENT_TIMESTAMP),
  updated_at text not null default (CURRENT_TIMESTAMP),
  constraint jobs_status_check check (
    status in ('WAITING', 'RUNNING', 'FINISHED', 'ABORTED')
  ),
  constraint jobs_result_count_check check (result_count >= 0)
);

create unique index jobs_execute_url_unique_idx on jobs (execute_id, url);
create index jobs_execute_status_idx on jobs (execute_id, status);
create index jobs_parent_job_id_idx on jobs (parent_job_id);

create table records (
  id text primary key,
  job_id text not null references jobs (id)
    on delete cascade
    on update cascade,
  url text not null,
  meta text not null default '{}',
  data text not null,
  started_at text not null default (CURRENT_TIMESTAMP),
  crawled_at text not null default (CURRENT_TIMESTAMP),
  created_at text not null default (CURRENT_TIMESTAMP),
  updated_at text not null default (CURRENT_TIMESTAMP)
);

create index records_job_id_idx on records (job_id);
create index records_url_idx on records (url);
