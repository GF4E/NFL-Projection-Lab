#!/bin/bash
# Run as root on the newly created Ubuntu host. No credentials in this file.
set -euo pipefail
install -d -m 755 /opt/nfl-runtime
if [ ! -x /usr/local/bin/micromamba ]; then
  curl --fail --silent --show-error --location https://micro.mamba.pm/api/micromamba/linux-64/latest -o /opt/nfl-runtime/micromamba.tar.bz2
  tar -xjf /opt/nfl-runtime/micromamba.tar.bz2 -C /opt/nfl-runtime bin/micromamba
  install -m 755 /opt/nfl-runtime/bin/micromamba /usr/local/bin/micromamba
fi
export MAMBA_ROOT_PREFIX=/opt/nfl-runtime/mamba
micromamba create -y --prefix /opt/nfl-runtime/env -f /opt/nfl-runtime/environment.yml
micromamba list --prefix /opt/nfl-runtime/env --explicit > /opt/nfl-runtime/linux-64.explicit.txt
/opt/nfl-runtime/env/bin/python -c 'import sys,numpy,pandas,scipy,pyarrow,requests; print(sys.version); print(numpy.__version__,pandas.__version__,scipy.__version__,pyarrow.__version__,requests.__version__)'
