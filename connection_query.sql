SELECT pid,usename,backend_start,state,client_addr FROM pg_stat_activity WHERE datname='postgres' ;
